import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError, ok } from '../../shared/http';
import { requireAuth } from '../../middleware/auth';

export const receivablesRouter = Router();

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD');

const createSchema = z.object({
  clientName: z.string().min(1),
  clientId: z.string().optional(),
  amount: z.coerce.number().nonnegative(),
  dueDate: dateStr,
  issuedDate: dateStr.optional(),
  status: z.enum(['pending', 'overdue', 'partial', 'paid']).optional(),
});

const updateSchema = z.object({
  amount: z.coerce.number().nonnegative().optional(),
  dueDate: dateStr.optional(),
  status: z.enum(['pending', 'overdue', 'partial', 'paid']).optional(),
});

// GET /api/v1/receivables — lista (filtro status).
receivablesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const status = z
      .enum(['pending', 'overdue', 'partial', 'paid'])
      .optional()
      .parse(req.query.status);
    let q = a.db
      .from('receivables')
      .select('*')
      .eq('company_id', a.companyId)
      .order('due_date', { ascending: true });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw ApiError.badRequest(error.message);
    return ok(res, data);
  }),
);

// POST /api/v1/receivables — crear cuenta por cobrar.
receivablesRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const input = createSchema.parse(req.body);
    const { data, error } = await a.db
      .from('receivables')
      .insert({
        company_id: a.companyId,
        client_name: input.clientName,
        client_id: input.clientId ?? null,
        amount: input.amount,
        due_date: input.dueDate,
        issued_date: input.issuedDate ?? new Date().toISOString().slice(0, 10),
        status: input.status ?? 'pending',
      })
      .select('*')
      .single();
    if (error) throw ApiError.badRequest(error.message);
    return ok(res, data, 201);
  }),
);

// PATCH /api/v1/receivables/:id
receivablesRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const input = updateSchema.parse(req.body);
    const patch: Record<string, unknown> = {};
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.dueDate !== undefined) patch.due_date = input.dueDate;
    if (input.status !== undefined) patch.status = input.status;

    const { data, error } = await a.db
      .from('receivables')
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
