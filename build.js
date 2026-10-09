const fs = require('node:fs/promises');
const path = require('node:path');
const { fetchAnnouncements } = require('./announcements');

const ROOT = __dirname;
const PUBLISH_DIRECTORY = path.join(ROOT, 'dist');
const STATIC_FILES = ['index.html', 'app.js', 'styles.css'];

async function buildStaticSite({
  loadAnnouncements = fetchAnnouncements,
  outputDirectory = PUBLISH_DIRECTORY,
} = {}) {
  const { items, fetchedAt } = await loadAnnouncements();
  const announcements = JSON.stringify({ items, fetchedAt }, null, 2) + '\n';

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

module.exports = { buildStaticSite };
