const FEED_URL = 'https://student.wwsi.edu.pl/feed/';
const MAX_FEED_BYTES = 1_000_000;
const MAX_ANNOUNCEMENTS = 50;

function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|#039);/gi, (entity, code) => {
    if (code[0] === '#') {
      const numeric = code[1]?.toLowerCase() === 'x'
        ? Number.parseInt(code.slice(2), 16)
        : Number.parseInt(code.slice(1), 10);
      return Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff
        ? String.fromCodePoint(numeric)
        : entity;
    }
    const namedEntities = {
      amp: '&',
      apos: "'",
      gt: '>',
      lt: '<',
      nbsp: ' ',
      quot: '"',
      '#039': "'",
    };
    return namedEntities[code.toLowerCase()] ?? entity;
  });
}

function xmlValue(xml, tagName) {
  const escapedName = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<${escapedName}\\b[^>]*>([\\s\\S]*?)<\\/${escapedName}\\s*>`, 'i'));
  if (!match) return '';
  const cdata = match[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return decodeEntities(cdata ? cdata[1] : match[1].replace(/<[^>]*>/g, ' ')).trim();
}

function plainText(html) {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' '),
  )
    .replace(/\s*Artykuł\s+.*?pochodzi z serwisu.*$/i, '')
    .trim();
}

function referencedGroups(text) {
  const groups = new Set();
  const normalized = text.replace(/[–—]/g, '-');
  const rangePattern = /\bZ\s*[- ]?\s*(30[1-5])\s*-\s*Z?\s*(30[1-5])\b/gi;
  for (const match of normalized.matchAll(rangePattern)) {
    const first = Number(match[1].slice(-1));
    const last = Number(match[2].slice(-1));
    for (let number = Math.min(first, last); number <= Math.max(first, last); number += 1) {
      groups.add(String(300 + number));
    }
  }
  for (const match of normalized.matchAll(/\bZ\s*[- ]?\s*(30[1-5])\b/gi)) {
    groups.add(match[1]);
  }
  return [...groups].sort();
}

function announcementScope(title, description, groups) {
  if (groups.includes('301')) return 'Z301';
  if (groups.length) return `Inne grupy: ${groups.map((group) => `Z${group}`).join(', ')}`;
  if (/\b(?:[A-Z]{1,3}\s*)\d{3,4}L?\b/i.test(`${title} ${description}`)) return 'Inne grupy';
  return 'Ogólne';
}

function safeSourceUrl(value) {
  try {
    const url = new URL(value, FEED_URL);
    if (url.protocol !== 'https:' || url.hostname !== 'student.wwsi.edu.pl') return null;
    return url.href;
  } catch {
    return null;
  }
}

function parseRss(xml) {
  if (typeof xml !== 'string' || !/<rss\b/i.test(xml)) {
    throw new Error('Źródło nie zwróciło poprawnego kanału RSS.');
  }

  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi)]
    .slice(0, MAX_ANNOUNCEMENTS)
    .map(([, item]) => {
      const title = xmlValue(item, 'title');
      const url = safeSourceUrl(xmlValue(item, 'link'));
      const publicationDate = new Date(xmlValue(item, 'pubDate'));
      const description = plainText(xmlValue(item, 'description')).slice(0, 500);
      if (!title || !url || !Number.isFinite(publicationDate.getTime())) return null;
      const groups = referencedGroups(`${title} ${description}`);
      return {
        title,
        url,
        publishedAt: publicationDate.toISOString(),
        description,
        groups,
        scope: announcementScope(title, description, groups),
      };
    })
    .filter(Boolean);

  if (items.length === 0) {
    throw new Error('Kanał RSS nie zawiera poprawnych komunikatów.');
  }
  return items.sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
}

async function readFeedBody(response) {
  if (!response.body) throw new Error('Kanał RSS zwrócił pustą odpowiedź.');

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_FEED_BYTES) {
      await reader.cancel();
      throw new Error('Kanał RSS przekracza dozwolony rozmiar.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchAnnouncements({ fetchImpl = fetch, now = Date.now } = {}) {
  const response = await fetchImpl(FEED_URL, {
    headers: { Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8' },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Kanał RSS odpowiedział kodem HTTP ${response.status}.`);
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (contentLength > MAX_FEED_BYTES) throw new Error('Kanał RSS przekracza dozwolony rozmiar.');
  const xml = await readFeedBody(response);
  return {
    items: parseRss(xml),
    fetchedAt: new Date(now()).toISOString(),
  };
}

module.exports = {
  FEED_URL,
  fetchAnnouncements,
  parseRss,
  referencedGroups,
};
