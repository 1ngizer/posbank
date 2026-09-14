import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError, ok } from '../../shared/http';
import { requireAuth } from '../../middleware/auth';

export const payablesRouter = Router();

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD');

const createSchema = z.object({
  supplierName: z.string().min(1),
  supplierId: z.string().optional(),
  amount: z.coerce.number().nonnegative(),
  dueDate: dateStr,
  status: z.enum(['pending', 'overdue', 'paid']).optional(),
  earlyPaymentDiscountPct: z.coerce.number().min(0).max(100).optional(),
});

const updateSchema = z.object({
  amount: z.coerce.number().nonnegative().optional(),
  dueDate: dateStr.optional(),
  status: z.enum(['pending', 'overdue', 'paid']).optional(),
  earlyPaymentDiscountPct: z.coerce.number().min(0).max(100).optional(),
});

// GET /api/v1/payables — lista (filtro status).
payablesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const status = z
      .enum(['pending', 'overdue', 'paid'])
      .optional()
      .parse(req.query.status);
    let q = a.db
      .from('payables')
      .select('*')
      .eq('company_id', a.companyId)
      .order('due_date', { ascending: true });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw ApiError.badRequest(error.message);
    return ok(res, data);
  }),
);

// POST /api/v1/payables — crear cuenta por pagar.
payablesRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const input = createSchema.parse(req.body);
    const { data, error } = await a.db
      .from('payables')
      .insert({
        company_id: a.companyId,
        supplier_name: input.supplierName,
        supplier_id: input.supplierId ?? null,
        amount: input.amount,
        due_date: input.dueDate,
        status: input.status ?? 'pending',
        early_payment_discount_pct: input.earlyPaymentDiscountPct ?? 0,
      })
      .select('*')
      .single();
    if (error) throw ApiError.badRequest(error.message);
    return ok(res, data, 201);
  }),
);

// PATCH /api/v1/payables/:id
payablesRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const input = updateSchema.parse(req.body);
    const patch: Record<string, unknown> = {};
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.dueDate !== undefined) patch.due_date = input.dueDate;
    if (input.status !== undefined) patch.status = input.status;
    if (input.earlyPaymentDiscountPct !== undefined)
      patch.early_payment_discount_pct = input.earlyPaymentDiscountPct;

    const { data, error } = await a.db
      .from('payables')
      .update(patch)
      .eq('company_id', a.companyId)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw ApiError.badRequest(error.message);
    if (!data) throw ApiError.notFound();
    return ok(res, data);
  }),
);
