import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { apiRouter } from './routes';
import { errorHandler, notFound } from './middleware/error';

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  
  // Configuramos CORS permitiendo los orígenes en producción y localhost para desarrollo.
  const allowedOrigins = env.CORS_ORIGINS 
    ? env.CORS_ORIGINS.split(',').map(o => o.trim())
    : ['https://app.posbank.ingizer.com', 'https://posbank.ingizer.com', 'http://localhost:5173'];
    
  app.use(cors({ origin: allowedOrigins }));
  // Los webhooks de WhatsApp/Make necesitan el body crudo para verificar firma;
  // guardamos rawBody además del parse JSON.
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(pinoHttp({ logger }));

  // Health check (sin auth) para monitoreo / Railway / Render.
  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'posbank', ts: new Date().toISOString() });
  });

  // API v1
  app.use(env.API_BASE_PATH, apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
