/**
 * Servidor estático para la app de PosBank (build de Vite en dist/).
 * Sin dependencias: solo módulos nativos de Node.
 * Incluye fallback SPA: cualquier ruta desconocida sirve index.html para que
 * /movimientos, /pos, /cliente/:id, etc. funcionen al recargar.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ROOT = path.join(__dirname, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// Los assets de Vite llevan hash en el nombre → caché larga.
function cacheFor(urlPath, ext) {
  if (urlPath.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  if (['.woff2', '.woff', '.ttf', '.svg', '.png', '.jpg', '.ico'].includes(ext)) {
    return 'public, max-age=604800';
  }
  return 'no-cache'; // index.html y manifest: siempre frescos
}

function sendFile(res, filePath, urlPath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500).end('Error');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cacheFor(urlPath, ext),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  // fs.stat lanza de forma SÍNCRONA (no por el callback de error) cuando la
  // ruta trae un byte nulo — sondas automáticas de "%00../.env" lo explotan
  // para tumbar el proceso entero. Se corta aquí, antes de tocar el sistema
  // de archivos.
  if (urlPath.includes('\0')) {
    res.writeHead(400).end('Bad request');
    return;
  }

  const indexPath = path.join(ROOT, 'index.html');
  if (urlPath === '/') {
    sendFile(res, indexPath, '/');
    return;
  }

  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      sendFile(res, filePath, urlPath);
    } else {
      // Fallback SPA: el router de React resuelve la ruta.
      sendFile(res, indexPath, '/');
    }
  });
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
  console.log(`PosBank app sirviendo dist/ en puerto ${PORT}`);
});
