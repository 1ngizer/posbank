import { describe, it, expect } from 'vitest';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { EventEmitter } from 'events';

describe('Logger Redaction (SEC-01)', () => {
  it('redacts Authorization and Cookie headers from HTTP logs', () => {
    let captured = '';
    const dest = {
      write(msg: string) {
        captured += msg;
      },
    };

    const testLogger = pino(
      {
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'headers.authorization',
            'headers.cookie',
            'authorization',
            'cookie',
          ],
          censor: '[REDACTED]',
        },
      },
      dest as any,
    );

    const middleware = pinoHttp({ logger: testLogger });
    const req: any = {
      method: 'GET',
      url: '/api/v1/movements',
      headers: {
        authorization: 'Bearer super_secret_jwt_token',
        cookie: 'session_id=secret123',
        host: 'localhost',
      },
      socket: { remoteAddress: '127.0.0.1' },
    };

    const res: any = new EventEmitter();
    res.statusCode = 200;
    res.getHeader = () => undefined;

    middleware(req, res);
    res.emit('finish');

    expect(captured).toContain('"authorization":"[REDACTED]"');
    expect(captured).toContain('"cookie":"[REDACTED]"');
    expect(captured).not.toContain('super_secret_jwt_token');
    expect(captured).not.toContain('secret123');
  });
});
