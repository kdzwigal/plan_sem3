const assert = require('node:assert/strict');
const { X509Certificate } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { FEED_URL, fetchAnnouncements, fetchRss, parseRss, referencedGroups } = require('../announcements');
const { buildStaticSite } = require('../build');
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

test('fetches the RSS feed with a verified, bounded request', async () => {
  let request;
  const result = await fetchAnnouncements({
    fetchImpl: async (...args) => {
      request = args;
      return new Response(feed, { status: 200 });
    },
    now: () => Date.parse('2026-10-09T10:57:55.000Z'),
  });
  assert.equal(request[0], FEED_URL);
  assert.equal(request[1].redirect, 'error');
  assert.equal(request[1].headers.Accept.includes('application/rss+xml'), true);
  assert.equal(result.items.length, 2);
  assert.equal(result.fetchedAt, '2026-10-09T10:57:55.000Z');
});

test('adds only the verified RSS issuer certificate while retaining Node trusted roots', async () => {
  const request = new EventEmitter();
  let requestUrl;
  let requestOptions;
  const response = Readable.from([Buffer.from(feed)]);
  response.statusCode = 200;
  response.headers = { 'content-type': 'application/rss+xml' };

  const result = await fetchRss(
    FEED_URL,
    { headers: { Accept: 'application/rss+xml' }, signal: AbortSignal.timeout(1_000) },
    (url, options, onResponse) => {
      requestUrl = url;
      requestOptions = options;
      onResponse(response);
      return request;
    },
  );

  assert.equal(requestUrl.href, FEED_URL);
  assert.equal(requestOptions.headers['Accept-Encoding'], 'identity');
  assert.deepEqual(requestOptions.ca.slice(0, -1), require('node:tls').rootCertificates);
  const issuer = new X509Certificate(requestOptions.ca.at(-1));
  assert.equal(issuer.fingerprint256, '5B:67:8D:C4:40:95:A5:28:95:B6:3B:31:F2:72:27:F4:B3:6C:3E:34:74:91:BF:2B:FA:69:18:37:A5:FB:8C:79');
  assert.match(await result.text(), /<rss/);
});

test('refuses to use the RSS-specific trust certificate for other origins', () => {
  assert.throws(
    () => fetchRss('https://example.com/feed/', { headers: {}, signal: AbortSignal.timeout(1_000) }),
    /Adres kanału RSS jest niedozwolony/,
  );
});

async function withTempDirectory(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-zajec-build-'));
  try {
    await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test('builds static assets and includes a validated RSS fallback without fetching the network', async () => {
  await withTempDirectory(async (outputDirectory) => {
    await buildStaticSite({ outputDirectory });
    assert.equal(
      await fs.readFile(path.join(outputDirectory, 'data', 'schedule.json'), 'utf8'),
      await fs.readFile(path.join(__dirname, '..', 'data', 'schedule.json'), 'utf8'),
    );
    assert.match(await fs.readFile(path.join(outputDirectory, 'app.js'), 'utf8'), /\/api\/announcements/);
    assert.deepEqual((await fs.readdir(outputDirectory)).sort(), ['app.js', 'data', 'index.html', 'styles.css']);
    assert.deepEqual(
      (await fs.readdir(path.join(outputDirectory, 'data'))).sort(),
      ['announcements.json', 'schedule.json'],
    );
  });
});

test('fetches fresh RSS on each announcements request and disables response caching', async () => {
  await withTempDirectory(async (outputDirectory) => {
    await buildStaticSite({ outputDirectory });
    let fetchCount = 0;
    const server = createServer({
      publishDirectory: outputDirectory,
      fetchLiveAnnouncements: async () => {
        fetchCount += 1;
        return {
          items: parseRss(feed),
          fetchedAt: `2026-10-09T10:57:${String(fetchCount).padStart(2, '0')}.000Z`,
        };
      },
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      for (let request = 1; request <= 2; request += 1) {
        const response = await fetch(`${baseUrl}/api/announcements`);
        const result = await response.json();
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(result.fetchedAt, `2026-10-09T10:57:${String(request).padStart(2, '0')}.000Z`);
      }
      assert.equal(fetchCount, 2);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});

test('serves a validated stale RSS snapshot when the source is temporarily unavailable', async () => {
  await withTempDirectory(async (outputDirectory) => {
    await buildStaticSite({ outputDirectory });
    const warnings = [];
    const server = createServer({
      publishDirectory: outputDirectory,
      fetchLiveAnnouncements: async () => {
        throw new Error('Kanał RSS niedostępny.');
      },
      logger: { error() {}, warn(message) { warnings.push(message); } },
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/announcements`);
      const result = await response.json();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(result.isStale, true);
      assert.equal(result.items.length, 17);
      assert.equal(warnings.length, 1);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});

test('reports an RSS failure if neither live data nor a valid fallback is available', async () => {
  await withTempDirectory(async (outputDirectory) => {
    await buildStaticSite({ outputDirectory });
    const server = createServer({
      publishDirectory: outputDirectory,
      cacheFile: path.join(outputDirectory, 'missing-announcements.json'),
      fetchLiveAnnouncements: async () => {
        throw new Error('Kanał RSS niedostępny.');
      },
      logger: { error() {}, warn() {} },
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/announcements`);
      assert.equal(response.status, 502);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), { error: 'Nie udało się pobrać komunikatów z kanału RSS.' });
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
