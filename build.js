const fs = require('node:fs/promises');
const path = require('node:path');
const { isAnnouncementsSnapshot } = require('./announcements');

const ROOT = __dirname;
const PUBLISH_DIRECTORY = path.join(ROOT, 'dist');
const ANNOUNCEMENTS_CACHE = path.join(ROOT, 'data', 'announcements.json');
const STATIC_FILES = ['index.html', 'app.js', 'styles.css', 'warsaw-roads.svg'];

async function buildStaticSite({ outputDirectory = PUBLISH_DIRECTORY } = {}) {
  const cachedAnnouncements = JSON.parse(await fs.readFile(ANNOUNCEMENTS_CACHE, 'utf8'));
  if (!isAnnouncementsSnapshot(cachedAnnouncements)) {
    throw new Error('Zapisana migawka komunikatów jest nieprawidłowa.');
  }

  await fs.rm(outputDirectory, { recursive: true, force: true });
  await fs.mkdir(path.join(outputDirectory, 'data'), { recursive: true });
  for (const file of STATIC_FILES) {
    await fs.copyFile(path.join(ROOT, file), path.join(outputDirectory, file));
  }
  await fs.copyFile(
    path.join(ROOT, 'data', 'schedule.json'),
    path.join(outputDirectory, 'data', 'schedule.json'),
  );
  await fs.copyFile(
    ANNOUNCEMENTS_CACHE,
    path.join(outputDirectory, 'data', 'announcements.json'),
  );
  console.log('Wygenerowano pliki witryny.');
}

if (require.main === module) {
  buildStaticSite().catch((error) => {
    console.error('Nie udało się zbudować statycznej strony:', error);
    process.exitCode = 1;
  });
}

module.exports = { buildStaticSite };
