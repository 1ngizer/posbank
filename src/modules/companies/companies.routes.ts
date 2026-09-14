import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError, ok } from '../../shared/http';
import { requireAuth, requireRole } from '../../middleware/auth';

export const companiesRouter = Router();

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  nit: z.string().optional(),
  industry: z.string().optional(),
  size: z.coerce.number().int().min(1).max(50).optional(),
  minimumCashReserve: z.coerce.number().min(0).optional(),
  alertPreferences: z
    .object({
      whatsapp: z.boolean().optional(),
      alexa: z.boolean().optional(),
      app: z.boolean().optional(),
      email: z.boolean().optional(),
    })
    .optional(),
});

// GET /api/v1/companies/me — datos de la empresa del usuario.
companiesRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const { data, error } = await a.db
      .from('companies')
      .select('*')
      .eq('id', a.companyId)
      .single();
    if (error || !data) throw ApiError.notFound('Empresa no encontrada');
    return ok(res, data);
  }),
);

// PATCH /api/v1/companies/me — actualiza datos y settings (solo owner/manager).
companiesRouter.patch(
  '/me',
  requireAuth,
  requireRole('owner', 'manager'),
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const input = updateSchema.parse(req.body);

    // Traemos settings actuales para hacer merge parcial.
    const { data: current } = await a.db
      .from('companies')
      .select('settings')
      .eq('id', a.companyId)
      .single();

    const settings = { ...(current?.settings ?? {}) };
    if (input.minimumCashReserve !== undefined) {
      settings.minimum_cash_reserve = input.minimumCashReserve;
    }
    if (input.alertPreferences) {
      settings.alert_preferences = {
        ...(settings.alert_preferences ?? {}),
        ...input.alertPreferences,
      };
    }

    const patch: Record<string, unknown> = { settings };
    if (input.name !== undefined) patch.name = input.name;
    if (input.nit !== undefined) patch.nit = input.nit;
    if (input.industry !== undefined) patch.industry = input.industry;
    if (input.size !== undefined) patch.size = input.size;

    const { data, error } = await a.db
      .from('companies')
      .update(patch)
      .eq('id', a.companyId)
      .select('*')
      .single();
    if (error) throw ApiError.badRequest(error.message);
    return ok(res, data);
  }),
);
