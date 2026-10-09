const fs = require('node:fs/promises');
const path = require('node:path');
const { fetchAnnouncements } = require('./announcements');

const ROOT = __dirname;
const PUBLISH_DIRECTORY = path.join(ROOT, 'dist');
const ANNOUNCEMENTS_CACHE = path.join(ROOT, 'data', 'announcements.json');
const STATIC_FILES = ['index.html', 'app.js', 'styles.css'];

function isAnnouncementsSnapshot(value) {
  return value
    && Array.isArray(value.items)
    && value.items.length > 0
    && typeof value.fetchedAt === 'string'
    && Number.isFinite(Date.parse(value.fetchedAt))
    && value.items.every((item) =>
      typeof item.title === 'string'
      && typeof item.description === 'string'
      && typeof item.scope === 'string'
      && Array.isArray(item.groups)
      && typeof item.publishedAt === 'string'
      && Number.isFinite(Date.parse(item.publishedAt))
      && typeof item.url === 'string'
      && new URL(item.url).origin === 'https://student.wwsi.edu.pl',
    );
}

async function loadAnnouncementsSnapshot(loadAnnouncements, cacheFile) {
  try {
    const latest = await loadAnnouncements();
    if (!isAnnouncementsSnapshot(latest)) {
      throw new Error('Źródło RSS zwróciło nieprawidłowe dane.');
    }
    return latest;
  } catch (fetchError) {
    try {
      const cached = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
      if (!isAnnouncementsSnapshot(cached)) {
        throw new Error('Zapisana migawka komunikatów jest nieprawidłowa.');
      }
      console.warn(
        `Nie udało się pobrać RSS (${fetchError.message}). ` +
        `Używam migawki z ${cached.fetchedAt}; sprawdź poprawność jej certyfikatu TLS.`,
      );
      return cached;
    } catch (cacheError) {
      throw new AggregateError(
        [fetchError, cacheError],
        'Nie udało się pobrać RSS ani wczytać prawidłowej migawki komunikatów.',
      );
    }
  }
}

async function buildStaticSite({
  loadAnnouncements = fetchAnnouncements,
  outputDirectory = PUBLISH_DIRECTORY,
  cacheFile = ANNOUNCEMENTS_CACHE,
} = {}) {
  const snapshot = await loadAnnouncementsSnapshot(loadAnnouncements, cacheFile);
  const announcements = JSON.stringify(snapshot, null, 2) + '\n';
  const { items } = snapshot;

  await fs.rm(outputDirectory, { recursive: true, force: true });
  await fs.mkdir(path.join(outputDirectory, 'data'), { recursive: true });
  for (const file of STATIC_FILES) {
    await fs.copyFile(path.join(ROOT, file), path.join(outputDirectory, file));
  }
  await fs.copyFile(
    path.join(ROOT, 'data', 'schedule.json'),
    path.join(outputDirectory, 'data', 'schedule.json'),
  );
  await fs.writeFile(path.join(outputDirectory, 'data', 'announcements.json'), announcements);
  console.log(`Wygenerowano stronę statyczną. Komunikaty WWSI: ${items.length}.`);
}

if (require.main === module) {
  buildStaticSite().catch((error) => {
    console.error('Nie udało się zbudować statycznej strony:', error);
    process.exitCode = 1;
  });
}

module.exports = { buildStaticSite, isAnnouncementsSnapshot };
