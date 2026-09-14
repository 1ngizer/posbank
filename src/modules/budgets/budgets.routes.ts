import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError, ok } from '../../shared/http';
import { requireAuth } from '../../middleware/auth';

export const budgetsRouter = Router();

const upsertSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  revenueBudget: z.coerce.number().min(0).default(0),
  costBudget: z.coerce.number().min(0).default(0),
  expenseBudget: z.coerce.number().min(0).default(0),
  salesTarget: z.coerce.number().min(0).default(0),
});

// GET /api/v1/budgets — lista (opcional filtro year).
budgetsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const year = z.coerce.number().int().optional().parse(req.query.year);
    let q = a.db
      .from('budgets')
      .select('*')
      .eq('company_id', a.companyId)
      .order('year', { ascending: false })
      .order('month', { ascending: false });
    if (year) q = q.eq('year', year);
    const { data, error } = await q;
    if (error) throw ApiError.badRequest(error.message);
    return ok(res, data);
  }),
);

// POST /api/v1/budgets — crea o actualiza el presupuesto del mes (upsert).
budgetsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const input = upsertSchema.parse(req.body);
    const { data, error } = await a.db
      .from('budgets')
      .upsert(
        {
          company_id: a.companyId,
          month: input.month,
          year: input.year,
          revenue_budget: input.revenueBudget,
          cost_budget: input.costBudget,
          expense_budget: input.expenseBudget,
          sales_target: input.salesTarget,
        },
        { onConflict: 'company_id,year,month' },
      )
      .select('*')
      .single();
    if (error) throw ApiError.badRequest(error.message);
    return ok(res, data, 201);
  }),
);
