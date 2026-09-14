import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok } from '../../shared/http';
import { requireAuth } from '../../middleware/auth';
import { createMovement, listMovements } from './movements.service';

export const movementsRouter = Router();

const categoryEnum = z.enum([
  'sales',
  'payroll',
  'suppliers',
  'taxes',
  'rent',
  'utilities',
  'other',
]);

const createSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.coerce.number().nonnegative(),
  currency: z.string().length(3).optional(),
  category: categoryEnum.optional(),
  description: z.string().max(500).optional(),
  referenceNumber: z.string().max(100).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha debe ser YYYY-MM-DD')
    .optional(),
});

const listSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  type: z.enum(['income', 'expense']).optional(),
  category: categoryEnum.optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

// POST /api/v1/movements — registrar movimiento.
movementsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const input = createSchema.parse(req.body);
    const movement = await createMovement(a.db, {
      companyId: a.companyId,
      userId: a.userId,
      sourceChannel: 'app',
      ...input,
    });
    return ok(res, movement, 201);
  }),
);

// GET /api/v1/movements — listar con filtros (fecha, tipo, categoría).
movementsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const f = listSchema.parse(req.query);
    const result = await listMovements(a.db, { companyId: a.companyId, ...f });
    return ok(res, result);
  }),
);
