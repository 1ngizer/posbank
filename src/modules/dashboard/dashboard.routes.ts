import { Router } from 'express';
import { asyncHandler, ok } from '../../shared/http';
import { requireAuth } from '../../middleware/auth';
import { runCashEngine } from '../analysis/cash-engine';

export const dashboardRouter = Router();

/**
 * GET /api/v1/dashboard — Resumen ejecutivo. Devuelve el CashAnalysis completo
 * (para pintar los 6 escenarios del radar) más las alertas recientes y no
 * leídas. Es un GET puro: no persiste alertas (eso lo hace el cron/webhook).
 */
dashboardRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const analysis = await runCashEngine(a.companyId, a.db);

    const [recentAlerts, unread] = await Promise.all([
      a.db
        .from('alerts')
        .select('*')
        .eq('company_id', a.companyId)
        .order('created_at', { ascending: false })
        .limit(10),
      a.db
        .from('alerts')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', a.companyId)
        .eq('status', 'sent'),
    ]);

    return ok(res, {
      analysis,
      alerts: {
        recent: recentAlerts.data ?? [],
        unreadCount: unread.count ?? 0,
      },
    });
  }),
);
