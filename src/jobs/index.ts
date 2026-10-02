import cron from 'node-cron';
import { logger } from '../config/logger';
import {
  runAlertsForAll,
  snapshotAll,
  refreshOverdueReceivables,
  reconcileAccountingSyncs,
} from './jobs.lib';

const TZ = 'America/Bogota';

/**
 * Registra los cron jobs de PosBank. Se puede correr como proceso aparte
 * (`npm run jobs`) o iniciarse junto al server (ver server.ts si se desea).
 */
export function startJobs(): void {
  // Cada hora: recalcular CashAnalysis y despachar críticas de inmediato.
  cron.schedule(
    '0 * * * *',
    () => {
      logger.info('⏰ Job horario: recálculo + alertas críticas');
      void runAlertsForAll(['critical']);
    },
    { timezone: TZ },
  );

  // Cada día 7am: snapshot + resumen diario (críticas + precauciones).
  cron.schedule(
    '0 7 * * *',
    async () => {
      logger.info('⏰ Job diario 7am: snapshot + resumen');
      await refreshOverdueReceivables();
      await snapshotAll();
      await runAlertsForAll(['critical', 'warning']);
    },
    { timezone: TZ },
  );

  // Cada lunes 7am: reporte semanal (incluye oportunidades).
  cron.schedule(
    '0 7 * * 1',
    () => {
      logger.info('⏰ Job semanal (lunes 7am): oportunidades');
      void runAlertsForAll(['opportunity', 'critical', 'warning']);
    },
    { timezone: TZ },
  );

  // Cada día 6am: verificar cartera vencida y compromisos próximos.
  cron.schedule(
    '0 6 * * *',
    () => {
      logger.info('⏰ Job diario 6am: cartera vencida');
      void refreshOverdueReceivables();
    },
    { timezone: TZ },
  );

  // Cada 15 minutos: reconciliar sincronizaciones contables pendientes/fallidas
  cron.schedule(
    '*/15 * * * *',
    () => {
      logger.info('⏰ Job cada 15m: reconciliación contable');
      void reconcileAccountingSyncs();
    },
    { timezone: TZ },
  );

  logger.info('🕑 Cron jobs de PosBank registrados (zona America/Bogota)');
}

// Permite correr los jobs como proceso independiente.
if (require.main === module) {
  startJobs();
}
