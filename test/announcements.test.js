const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { FEED_URL, fetchAnnouncements, parseRss, referencedGroups } = require('../announcements');
const { buildStaticSite } = require('../build');

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

async function withTempDirectory(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-zajec-build-'));
  try {
    await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test('builds a static publish directory with an RSS snapshot and only public files', async () => {
  await withTempDirectory(async (outputDirectory) => {
    const fetchedAt = '2026-10-09T10:57:55.000Z';
    await buildStaticSite({
      outputDirectory,
      loadAnnouncements: async () => ({ items: parseRss(feed), fetchedAt }),
    });
    const announcements = JSON.parse(
      await fs.readFile(path.join(outputDirectory, 'data', 'announcements.json'), 'utf8'),
    );
    assert.equal(announcements.fetchedAt, fetchedAt);
    assert.equal(announcements.items.length, 2);
    assert.equal(
      await fs.readFile(path.join(outputDirectory, 'data', 'schedule.json'), 'utf8'),
      await fs.readFile(path.join(__dirname, '..', 'data', 'schedule.json'), 'utf8'),
    );
    assert.match(await fs.readFile(path.join(outputDirectory, 'app.js'), 'utf8'), /data\/announcements\.json/);
    assert.deepEqual((await fs.readdir(outputDirectory)).sort(), ['app.js', 'data', 'index.html', 'styles.css']);
  });
});

test('fails the static build if the RSS feed cannot be loaded', async () => {
  await withTempDirectory(async (outputDirectory) => {
    await assert.rejects(
      buildStaticSite({
        outputDirectory,
        loadAnnouncements: async () => {
          throw new Error('Kanał RSS jest niedostępny.');
        },
      }),
      /Kanał RSS jest niedostępny/,
    );
    assert.deepEqual(await fs.readdir(outputDirectory), []);
  });
});
