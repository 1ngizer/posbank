import { Router } from 'express';
import { adminClient } from '../../config/supabase';
import { asyncHandler, ApiError, ok } from '../../shared/http';
import { requirePlatformAdmin } from '../../middleware/admin';
import { runCashEngine } from '../analysis/cash-engine';
import {
  buildCompanySummary,
  computeOverview,
  computeTrend,
  listCompanySummaries,
} from './admin.service';

export const adminRouter = Router();

// GET /api/v1/admin/me — el frontend lo usa para saber si es admin.
adminRouter.get(
  '/me',
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    return ok(res, { isAdmin: true, email: req.admin!.email });
  }),
);

// GET /api/v1/admin/companies — lista de clientes con sus indicadores + overview.
adminRouter.get(
  '/companies',
  requirePlatformAdmin,
  asyncHandler(async (_req, res) => {
    const summaries = await listCompanySummaries();
    return ok(res, { overview: computeOverview(summaries), companies: summaries });
  }),
);

// GET /api/v1/admin/trends — evolución de flujo de caja de toda la plataforma.
adminRouter.get(
  '/trends',
  requirePlatformAdmin,
  asyncHandler(async (_req, res) => {
    const trend = await computeTrend(null, 12);
    return ok(res, { trend });
  }),
);

// GET /api/v1/admin/companies/:id — detalle: análisis completo + alertas recientes.
adminRouter.get(
  '/companies/:id',
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    const { data: company, error } = await adminClient
      .from('companies')
      .select('id, name, nit, industry, size, created_at, settings')
      .eq('id', req.params.id)
      .single();
    if (error || !company) throw ApiError.notFound('Empresa no encontrada');

    const [analysis, summary, alerts, users, trend] = await Promise.all([
      runCashEngine(company.id, adminClient),
      buildCompanySummary(company),
      adminClient
        .from('alerts')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(15),
      adminClient
        .from('users')
        .select('name, email, role, phone_whatsapp')
        .eq('company_id', company.id),
      computeTrend(company.id, 12),
    ]);

    return ok(res, {
      company,
      summary,
      analysis,
      alerts: alerts.data ?? [],
      users: users.data ?? [],
      trend,
    });
  }),
);
