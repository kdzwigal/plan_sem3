const assert = require('node:assert/strict');
const test = require('node:test');
const { createAnnouncementLoader, parseRss, referencedGroups } = require('../announcements');
const { createServer } = require('../server');

const feed = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title><![CDATA[Uwaga grupy Z301 i Z305]]></title>
    <link>https://student.wwsi.edu.pl/uwaga-grupy-z301-i-z305/</link>
    <pubDate>Fri, 09 Oct 2026 10:57:55 +0000</pubDate>
    <description><![CDATA[<p>Zajęcia zostaną poprowadzone zdalnie &amp; w zwykłych godzinach.</p><p>Artykuł pochodzi z serwisu WWSI.</p>]]></description>
  </item>
  <item>
    <title>Wiadomość ogólna</title>
    <link>https://student.wwsi.edu.pl/wiadomosc/</link>
    <pubDate>Thu, 08 Oct 2026 08:00:00 +0000</pubDate>
    <description><![CDATA[<p>Informacja dla wszystkich studentów.</p>]]></description>
  </item>
  <item>
    <title>Nieprawidłowy link</title>
    <link>https://example.com/article/</link>
    <pubDate>Thu, 08 Oct 2026 08:00:00 +0000</pubDate>
    <description><![CDATA[<p>Ten wpis powinien zostać pominięty.</p>]]></description>
  </item>
</channel></rss>`;

test('parses RSS announcements, groups, dates, and plain-text descriptions', () => {
  const items = parseRss(feed);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0].groups, ['301', '305']);
  assert.equal(items[0].scope, 'Z301');
  assert.equal(items[0].description, 'Zajęcia zostaną poprowadzone zdalnie & w zwykłych godzinach.');
  assert.equal(items[1].scope, 'Ogólne');
  assert.equal(items[0].publishedAt, '2026-10-09T10:57:55.000Z');
});

test('expands Z30 group ranges without matching longer unrelated group names', () => {
  assert.deepEqual(referencedGroups('Grupy Z301-Z305 oraz MZ301L'), ['301', '302', '303', '304', '305']);
  assert.deepEqual(referencedGroups('Grupy MZ301L-MZ307L'), []);
});

test('rejects malformed RSS documents and invalid announcement dates', () => {
  assert.throws(() => parseRss('<html>nie jest to RSS</html>'), /poprawnego kanału RSS/);
  assert.throws(
    () => parseRss('<rss><channel><item><title>X</title><link>https://student.wwsi.edu.pl/x/</link><pubDate>nieznana data</pubDate></item></channel></rss>'),
    /nie zawiera poprawnych komunikatów/,
  );
});

test('caches successful feed responses and refreshes when requested', async () => {
  let calls = 0;
  let time = 1_000;
  const load = createAnnouncementLoader({
    fetchImpl: async () => {
      calls += 1;
      return new Response(feed, { status: 200 });
    },
    cacheTtlMs: 300_000,
    now: () => time,
  });

  const first = await load();
  time += 1_000;
  const cached = await load();
  assert.equal(calls, 1);
  assert.equal(cached.fetchedAt, first.fetchedAt);

  await load({ force: true });
  assert.equal(calls, 2);
});

async function withServer(loadAnnouncements, callback) {
  const server = createServer({ loadAnnouncements });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('serves announcements, rejects writes, and never serves unlisted files', async () => {
  const result = {
    items: parseRss(feed),
    fetchedAt: '2026-10-09T10:57:55.000Z',
  };
  await withServer(async () => result, async (origin) => {
    const response = await fetch(`${origin}/api/announcements`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), result);

    const writeResponse = await fetch(`${origin}/api/announcements`, { method: 'POST' });
    assert.equal(writeResponse.status, 405);
    assert.equal(writeResponse.headers.get('allow'), 'GET');

    const privateFile = await fetch(`${origin}/plan_sem3.xls`);
    assert.equal(privateFile.status, 404);
  });
});

test('passes an explicit refresh request through to the RSS cache', async () => {
  const refreshRequests = [];
  await withServer(async ({ force }) => {
    refreshRequests.push(force);
    return { items: parseRss(feed), fetchedAt: '2026-10-09T10:57:55.000Z' };
  }, async (origin) => {
    await fetch(`${origin}/api/announcements`);
    await fetch(`${origin}/api/announcements?refresh=1`);
  });
  assert.deepEqual(refreshRequests, [false, true]);
});

test('returns an explicit API error when the upstream feed is unavailable', async () => {
  await withServer(async () => {
    throw new Error('Kanał RSS odpowiedział kodem HTTP 503.');
  }, async (origin) => {
    const response = await fetch(`${origin}/api/announcements`);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Kanał RSS odpowiedział kodem HTTP 503.' });
  });
});
