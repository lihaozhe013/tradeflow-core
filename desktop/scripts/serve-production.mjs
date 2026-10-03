import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = await realpath('dist');
const config = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'));
const csp = config.app.security.csp;
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const requestedPath = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (requestedPath !== root && !requestedPath.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    const file = await realpath(requestedPath);
    if (file !== root && !file.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, {
      'content-type': mimeTypes.get(extname(file)) ?? 'application/octet-stream',
      'content-security-policy': csp
    });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});

server.listen(1422, '127.0.0.1');
