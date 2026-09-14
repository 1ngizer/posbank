import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError, ok } from '../../shared/http';
import { requireAuth } from '../../middleware/auth';

export const commitmentsRouter = Router();

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD');

const createSchema = z.object({
  name: z.string().min(1),
  amount: z.coerce.number().nonnegative(),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly']).default('monthly'),
  nextDueDate: dateStr,
  isActive: z.boolean().default(true),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  amount: z.coerce.number().nonnegative().optional(),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly']).optional(),
  nextDueDate: dateStr.optional(),
  isActive: z.boolean().optional(),
});

// GET /api/v1/commitments — compromisos fijos.
commitmentsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const { data, error } = await a.db
      .from('fixed_commitments')
      .select('*')
      .eq('company_id', a.companyId)
      .order('next_due_date', { ascending: true });
    if (error) throw ApiError.badRequest(error.message);
    return ok(res, data);
  }),
);

// POST /api/v1/commitments — crear compromiso fijo.
commitmentsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const input = createSchema.parse(req.body);
    const { data, error } = await a.db
      .from('fixed_commitments')
      .insert({
        company_id: a.companyId,
        name: input.name,
        amount: input.amount,
        frequency: input.frequency,
        next_due_date: input.nextDueDate,
        is_active: input.isActive,
      })
      .select('*')
      .single();
    if (error) throw ApiError.badRequest(error.message);
    return ok(res, data, 201);
  }),
);

// PATCH /api/v1/commitments/:id
commitmentsRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const input = updateSchema.parse(req.body);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.frequency !== undefined) patch.frequency = input.frequency;
    if (input.nextDueDate !== undefined) patch.next_due_date = input.nextDueDate;
    if (input.isActive !== undefined) patch.is_active = input.isActive;

    const { data, error } = await a.db
      .from('fixed_commitments')
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
