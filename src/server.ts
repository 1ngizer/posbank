import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { adminClient } from './config/supabase';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(
    `🟢 PosBank API escuchando en http://localhost:${env.PORT}${env.API_BASE_PATH}`,
  );
});

/**
 * Ping liviano a Supabase cada 4 minutos. Sin tráfico, la conexión HTTPS al
 * REST de Supabase se enfría (DNS/TCP/TLS) y la primera consulta real paga
 * ese costo — visto en producción con Alexa: 9890ms en la primera consulta
 * tras ~2.5 días de inactividad. El límite de 6s de conLimiteAlexa ahora
 * cubre esa demora si igual ocurre, pero mantener la conexión viva evita que
 * el usuario la note. No hay proceso de cron corriendo en este servicio
 * (`startJobs` vive aparte y no está desplegado), así que esto va aquí.
 */
const KEEP_ALIVE_MS = 4 * 60 * 1000;
const keepAlive = setInterval(() => {
  void adminClient
    .from('companies')
    .select('id', { count: 'exact', head: true })
    .then(({ error }) => {
      if (error) logger.warn({ err: error.message }, 'Keep-alive de Supabase falló');
    });
}, KEEP_ALIVE_MS);
keepAlive.unref(); // no debe mantener el proceso vivo por sí solo

// Apagado limpio.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info(`${signal} recibido, cerrando servidor...`);
    clearInterval(keepAlive);
    server.close(() => process.exit(0));
  });
}
