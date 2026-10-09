const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createAnnouncementLoader } = require('./announcements');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/data/schedule.json', ['data/schedule.json', 'application/json; charset=utf-8']],
]);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function createServer({ loadAnnouncements = createAnnouncementLoader() } = {}) {
  return http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, 'http://localhost');
    const pathname = requestUrl.pathname;
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    if (pathname === '/api/announcements') {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        sendJson(response, 405, { error: 'Dozwolone jest tylko pobieranie komunikatów.' });
        return;
      }
      try {
        const { items, fetchedAt } = await loadAnnouncements({
          force: requestUrl.searchParams.get('refresh') === '1',
        });
        sendJson(response, 200, { items, fetchedAt });
      } catch (error) {
        console.error('Nie udało się pobrać komunikatów WWSI:', error);
        sendJson(response, 502, {
          error: error instanceof Error ? error.message : 'Nie udało się pobrać komunikatów WWSI.',
        });
      }
      return;
    }

    const file = STATIC_FILES.get(pathname);
    if (!file || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Nie znaleziono strony.');
      return;
    }

    try {
      const contents = await fs.readFile(path.join(ROOT, file[0]));
      response.writeHead(200, {
        'Cache-Control': pathname === '/' || pathname === '/index.html' ? 'no-cache' : 'public, max-age=300',
        'Content-Type': file[1],
      });
      response.end(request.method === 'HEAD' ? undefined : contents);
    } catch (error) {
      console.error(`Nie udało się odczytać pliku ${file[0]}:`, error);
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Nie udało się wczytać strony.');
    }
  });
}

if (require.main === module) {
  createServer().listen(PORT, '0.0.0.0', () => {
    console.log(`Plan zajęć dostępny na porcie ${PORT}.`);
  });
}

module.exports = { createServer };
