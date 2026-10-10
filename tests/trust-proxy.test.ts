import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';
import { TRUST_PROXY_HOPS } from '../src/app';

/**
 * Simula la cadena de Railway: la conexión TCP llega del proxy interno (aquí 127.0.0.1)
 * y el borde agrega su IP al final de X-Forwarded-For. req.ip debe ser la del cliente real.
 */
describe('trust proxy (Railway)', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    const app = express();
    app.set('trust proxy', TRUST_PROXY_HOPS);
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  function getIp(xff: string): Promise<string> {
    return new Promise((resolve, reject) => {
      http
        .get({ port, path: '/ip', headers: { 'x-forwarded-for': xff } }, (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve(JSON.parse(body).ip));
        })
        .on('error', reject);
    });
  }

  it('usa la IP real del cliente (penúltimo valor de X-Forwarded-For)', async () => {
    expect(await getIp('206.62.142.26, 152.233.23.194')).toBe('206.62.142.26');
  });

  it('ignora una IP falsa agregada por el cliente a la izquierda', async () => {
    expect(await getIp('1.2.3.4, 206.62.142.26, 152.233.23.194')).toBe('206.62.142.26');
  });

  it('dos clientes distintos obtienen cubos de límite distintos', async () => {
    const a = await getIp('203.0.113.10, 152.233.23.194');
    const b = await getIp('198.51.100.77, 152.233.23.194');
    expect(a).not.toBe(b);
  });
});
