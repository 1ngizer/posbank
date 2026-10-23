import { Router } from 'express';
import crypto from 'node:crypto';
import { adminClient } from '../../config/supabase';
import { env } from '../../config/env';
import { ApiError, asyncHandler } from '../../shared/http';
import { calcularResumenIngizer } from './ingizer.compute';

/**
 * Ruta de integración de SOLO LECTURA para Ingizer (valoración de empresas).
 * Se protege con una llave compartida (INGIZER_INTEGRATION_KEY) y devuelve únicamente totales, nunca datos personales.
 */
export const ingizerRouter = Router();

function llaveValida(recibida: string | undefined): boolean {
  const esperada = env.INGIZER_INTEGRATION_KEY;
  if (!esperada || !recibida) return false;
  const a = crypto.createHash('sha256').update(recibida).digest();
  const b = crypto.createHash('sha256').update(esperada).digest();
  return crypto.timingSafeEqual(a, b);
}

ingizerRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    if (!env.INGIZER_INTEGRATION_KEY) throw new ApiError(503, 'La integración con Ingizer no está activada.', 'unavailable');
    if (!llaveValida(req.header('x-integration-key'))) throw ApiError.unauthorized('Llave de integración inválida');

    const email = String(req.query.email ?? '').trim().toLowerCase();
    if (!email || email.length > 254) throw ApiError.badRequest('Falta el correo.');

    const { data: usuarios, error: eu } = await adminClient.from('users').select('company_id').ilike('email', email.replace(/[%_]/g, '\\$&')).limit(1);
    if (eu) throw new ApiError(500, 'No se pudo consultar.', 'internal');
    const companyId = usuarios?.[0]?.company_id as string | undefined;
    if (!companyId) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }

    const ventas: { amount: number; date: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await adminClient
        .from('cash_movements')
        .select('amount,date')
        .eq('company_id', companyId)
        .eq('type', 'income')
        .eq('category', 'sales')
        .order('date', { ascending: true })
        .range(from, from + 999);
      if (error) throw new ApiError(500, 'No se pudo consultar.', 'internal');
      ventas.push(...((data ?? []) as { amount: number; date: string }[]));
      if (!data || data.length < 1000) break;
    }
    const { data: cuentas, error: ec } = await adminClient.from('bank_accounts').select('current_balance').eq('company_id', companyId);
    if (ec) throw new ApiError(500, 'No se pudo consultar.', 'internal');

    res.json(calcularResumenIngizer(ventas, (cuentas ?? []).map((c) => c.current_balance as number)));
  }),
);
