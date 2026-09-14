/**
 * Servidor estático mínimo para la landing de PosBank.
 * Sin dependencias: solo módulos nativos de Node.
 * Railway inyecta PORT — hay que escuchar ahí y en 0.0.0.0.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

// Caché larga para assets con hash implícito; corta para HTML (para poder actualizar).
function cacheFor(ext) {
  if (['.ttf', '.woff', '.woff2', '.svg', '.png', '.jpg', '.jpeg', '.ico'].includes(ext)) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=300';
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  // fs.readFile valida la ruta de forma SÍNCRONA y lanza si trae un byte
  // nulo — sondas automáticas de "%00../.env" lo usan para tumbar el proceso.
  // Se corta aquí, antes de tocar el sistema de archivos.
  if (urlPath.includes('\0')) {
    res.writeHead(400).end('Bad request');
    return;
  }

  if (urlPath === '/') urlPath = '/index.html';

  // Normaliza y bloquea path traversal.
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  // URLs limpias: /privacidad sirve privacidad.html. Se intenta el archivo tal
  // cual primero, así los assets con extensión no pagan el reintento.
  const candidatos = path.extname(filePath)
    ? [filePath]
    : [filePath, `${filePath}.html`, path.join(filePath, 'index.html')];

  servir(candidatos, 0);

  function servir(lista, i) {
    if (i >= lista.length) return noEncontrado();
    fs.readFile(lista[i], (err, data) => {
      if (err) return servir(lista, i + 1);
      const ext = path.extname(lista[i]).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': cacheFor(ext),
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      });
      res.end(data);
    });
  }

  // 404 real (no soft-404): mejor para SEO que redirigir al index.
  function noEncontrado() {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<!doctype html><meta charset="utf-8"><title>404 — PosBank</title>' +
        '<div style="font-family:system-ui;text-align:center;padding:80px">' +
        '<h1>404</h1><p>Esta página no existe.</p>' +
        '<p><a href="/">Volver a PosBank</a></p></div>',
    );
  }
});

// Red de seguridad: una excepción síncrona en cualquier handler no debe
// tumbar el proceso completo — solo cerrar esa conexión.
server.on('clientError', (_err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PosBank landing sirviendo en puerto ${PORT}`);
});
