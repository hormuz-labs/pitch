#!/usr/bin/env node
/* Tiny static server for the review gallery: serves the repo root so
   effect pages can reach ../../../assets. node effects/serve.mjs [port] */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGallery } from './build-index.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.argv[2] || 4173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || p === '/effects' || p === '/effects/') { res.writeHead(302, { Location: '/effects/index.html' }); return res.end(); }
  if (p === '/effects/index.html') {
    try {
      const { html } = buildGallery();
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
      return res.end(html);
    } catch (err) {
      console.error('Could not build effects gallery:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end('Could not build effects gallery; see server output.');
    }
  }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.stat(f, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    const type = types[path.extname(f)] || 'application/octet-stream';
    const range = req.headers.range;
    if (range) {
      const [s, e] = range.replace('bytes=', '').split('-').map(Number);
      const start = s || 0, end = e || st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      return fs.createReadStream(f, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`effects gallery: http://127.0.0.1:${PORT}/effects/index.html`));
