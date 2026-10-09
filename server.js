const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { fetchAnnouncements, isAnnouncementsSnapshot } = require('./announcements');

const PUBLISH_DIRECTORY = path.join(__dirname, 'dist');
const ANNOUNCEMENTS_CACHE = path.join(__dirname, 'data', 'announcements.json');
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(value));
}

function createServer({
  fetchLiveAnnouncements = fetchAnnouncements,
  publishDirectory = PUBLISH_DIRECTORY,
  cacheFile = ANNOUNCEMENTS_CACHE,
  logger = console,
} = {}) {
  let lastKnownAnnouncements;
  return http.createServer(async (request, response) => {
    let requestUrl;
    try {
      requestUrl = new URL(request.url, 'http://localhost');
    } catch {
      response.writeHead(400).end('Bad request');
      return;
    }

    if (requestUrl.pathname === '/api/announcements') {
      if (request.method !== 'GET') {
        response.writeHead(405, { Allow: 'GET' }).end('Method not allowed');
        return;
      }
      try {
        const latest = await fetchLiveAnnouncements();
        if (!isAnnouncementsSnapshot(latest)) {
          throw new Error('Kanał RSS zwrócił nieprawidłowe dane.');
        }
        lastKnownAnnouncements = latest;
        sendJson(response, 200, { ...latest, isStale: false });
      } catch (fetchError) {
        try {
          const cached = lastKnownAnnouncements
            ?? JSON.parse(await fs.readFile(cacheFile, 'utf8'));
          if (!isAnnouncementsSnapshot(cached)) {
            throw new Error('Zapisana migawka komunikatów jest nieprawidłowa.');
          }
          logger.warn(
            `Nie udało się pobrać RSS (${fetchError.message}); ` +
            `zwracam migawkę z ${cached.fetchedAt}.`,
          );
          sendJson(response, 200, { ...cached, isStale: true });
        } catch (cacheError) {
          logger.error('Nie udało się pobrać komunikatów RSS ani wczytać migawki:', fetchError, cacheError);
          sendJson(response, 502, { error: 'Nie udało się pobrać komunikatów z kanału RSS.' });
        }
      }
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
    } catch {
      response.writeHead(400).end('Bad request');
      return;
    }

    const filePath = path.resolve(publishDirectory, `.${pathname}`);
    if (!filePath.startsWith(`${path.resolve(publishDirectory)}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    try {
      const content = await fs.readFile(filePath);
      response.writeHead(200, {
        'Cache-Control': 'no-cache',
        'Content-Type': CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
      });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
        logger.error('Nie udało się odczytać pliku witryny:', error);
        response.writeHead(500).end('Internal server error');
        return;
      }
      response.writeHead(404).end('Not found');
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const server = createServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`Serwer działa na porcie ${port}.`);
  });
}

module.exports = { createServer };
