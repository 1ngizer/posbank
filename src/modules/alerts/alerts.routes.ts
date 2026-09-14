import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError, ok } from '../../shared/http';
import { requireAuth } from '../../middleware/auth';

export const alertsRouter = Router();

// GET /api/v1/alerts — historial de alertas (filtros: severity, status).
alertsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const q = z
      .object({
        severity: z.enum(['critical', 'warning', 'info', 'opportunity']).optional(),
        status: z.enum(['sent', 'read', 'acted_on', 'dismissed']).optional(),
        limit: z.coerce.number().int().positive().max(200).optional(),
      })
      .parse(req.query);

    let query = a.db
      .from('alerts')
      .select('*')
      .eq('company_id', a.companyId)
      .order('created_at', { ascending: false })
      .limit(q.limit ?? 50);
    if (q.severity) query = query.eq('severity', q.severity);
    if (q.status) query = query.eq('status', q.status);

    const { data, error } = await query;
    if (error) throw ApiError.badRequest(error.message);
    return ok(res, data);
  }),
);

// PATCH /api/v1/alerts/:id — marcar leída / accionada / descartada.
alertsRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const { status } = z
      .object({ status: z.enum(['read', 'acted_on', 'dismissed']) })
      .parse(req.body);

    const patch: Record<string, unknown> = { status };
    if (status === 'read') patch.read_at = new Date().toISOString();
    if (status === 'acted_on') patch.acted_at = new Date().toISOString();

    const { data, error } = await a.db
      .from('alerts')
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
