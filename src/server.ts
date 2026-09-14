import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(
    `🟢 PosBank API escuchando en http://localhost:${env.PORT}${env.API_BASE_PATH}`,
  );
});

// Apagado limpio.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info(`${signal} recibido, cerrando servidor...`);
    server.close(() => process.exit(0));
  });
}
