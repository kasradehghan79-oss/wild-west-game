/* ==========================================================================
   The Wild West - tests/support/serve.mjs
   A dependency free static server for the suite. Playwright starts it through
   the webServer option in playwright.config.mjs, so `npm test` needs nothing
   running first. It serves the project root exactly like serve.cmd does.
   ========================================================================== */
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const port = Number(process.argv[2] || 8137);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.apk': 'application/vnd.android.package-archive'
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/' || url === '') url = '/index.html';
  // never let a request escape the project root
  const file = join(root, normalize(url).replace(/^[/\\]+/, ''));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  stat(file).then(st => {
    if (!st.isFile()) throw new Error('not a file');
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-store'
    });
    createReadStream(file).pipe(res);
  }).catch(() => {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[serve] ${root} on http://127.0.0.1:${port}/`);
});
