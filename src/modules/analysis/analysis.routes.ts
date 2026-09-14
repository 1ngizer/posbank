import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError, ok } from '../../shared/http';
import { requireAuth } from '../../middleware/auth';
import { runCashEngine } from './cash-engine';

export const analysisRouter = Router();

// GET /api/v1/cash-position — posición de caja actual (calculada al vuelo).
analysisRouter.get(
  '/cash-position',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const analysis = await runCashEngine(a.companyId, a.db);
    return ok(res, {
      computedAt: analysis.computedAt,
      cashPosition: analysis.cashPosition,
      runway: analysis.runway,
    });
  }),
);

// GET /api/v1/cash-position/history — histórico de snapshots diarios.
analysisRouter.get(
  '/cash-position/history',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const limit = z.coerce
      .number()
      .int()
      .positive()
      .max(365)
      .optional()
      .parse(req.query.limit);
    const { data, error } = await a.db
      .from('cash_position_snapshots')
      .select('*')
      .eq('company_id', a.companyId)
      .order('date', { ascending: false })
      .limit(limit ?? 30);
    if (error) throw ApiError.badRequest(error.message);
    return ok(res, data);
  }),
);

// GET /api/v1/runway — cálculo de runway (supervivencia).
analysisRouter.get(
  '/runway',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const analysis = await runCashEngine(a.companyId, a.db);
    return ok(res, analysis.runway);
  }),
);
