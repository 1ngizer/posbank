import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, ApiError } from '../../shared/http';
import { AccountingService } from './accounting.service';
import { AccountingProviderType } from './types';

export const accountingRouter = Router();

// Todos los endpoints de contabilidad requieren autenticación (multi-tenant RLS)
accountingRouter.use(requireAuth);

/**
 * GET /api/v1/accounting/status
 * Devuelve el estado actual de la integración contable de la empresa.
 */
accountingRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    const { db, companyId } = req.auth!;
    const status = await AccountingService.getConnectionStatus(db, companyId);
    res.json({ ok: true, data: status });
  }),
);

/**
 * POST /api/v1/accounting/connect
 * Conecta un proveedor contable con credenciales (cifradas en BD).
 */
accountingRouter.post(
  '/connect',
  asyncHandler(async (req, res) => {
    const { db, companyId } = req.auth!;
    const { provider, credentials } = req.body;

    if (!provider || !['alegra', 'siigo', 'worldoffice'].includes(provider)) {
      throw ApiError.badRequest('Proveedor inválido');
    }

    const status = await AccountingService.connectProvider(
      db,
      companyId,
      provider as AccountingProviderType,
      credentials,
    );

    res.json({
      ok: true,
      message: `Proveedor ${provider} conectado exitosamente`,
      data: status,
    });
  }),
);

/**
 * POST /api/v1/accounting/disconnect
 * Desconecta un proveedor contable.
 */
accountingRouter.post(
  '/disconnect',
  asyncHandler(async (req, res) => {
    const { db, companyId } = req.auth!;
    const { provider } = req.body;

    if (!provider) {
      throw ApiError.badRequest('Falta el nombre del proveedor a desconectar');
    }

    await AccountingService.disconnectProvider(db, companyId, provider as AccountingProviderType);
    res.json({ ok: true, message: 'Proveedor desconectado' });
  }),
);

/**
 * POST /api/v1/accounting/test
 * Prueba la conexión activa.
 */
accountingRouter.post(
  '/test',
  asyncHandler(async (req, res) => {
    const { db, companyId } = req.auth!;
    const result = await AccountingService.testActiveConnection(db, companyId);
    res.json({ ok: result.ok, message: result.message });
  }),
);

/**
 * GET /api/v1/accounting/logs
 * Retorna los registros recientes de la cola de sincronización.
 */
accountingRouter.get(
  '/logs',
  asyncHandler(async (req, res) => {
    const { db, companyId } = req.auth!;
    const logs = await AccountingService.getRecentLogs(db, companyId);
    res.json({ ok: true, data: logs });
  }),
);
