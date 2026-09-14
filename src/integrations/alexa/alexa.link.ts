import { randomInt } from 'node:crypto';
import { adminClient } from '../../config/supabase';
import { logger } from '../../config/logger';

/**
 * Vinculación de Alexa por código de 6 dígitos.
 *
 * El usuario pide un código en la app y se lo dicta al skill. Es la alternativa
 * al Account Linking de Amazon (OAuth), que hace falta solo para publicar el
 * skill en la tienda.
 */

const VIGENCIA_MINUTOS = 10;
const UNIQUE_VIOLATION = '23505';

export interface CodigoGenerado {
  code: string;
  expiresAt: string;
  minutos: number;
}

/**
 * Emite un código nuevo e invalida los anteriores del mismo usuario, para que
 * nunca haya dos códigos vivos apuntando a la misma cuenta.
 */
export async function crearCodigoVinculacion(
  userId: string,
  companyId: string,
): Promise<CodigoGenerado> {
  await adminClient
    .from('alexa_link_codes')
    .delete()
    .eq('user_id', userId)
    .is('used_at', null);

  const expiresAt = new Date(Date.now() + VIGENCIA_MINUTOS * 60_000).toISOString();

  // Colisionar con un código vivo es improbable, pero se reintenta por si acaso.
  for (let intento = 0; intento < 5; intento += 1) {
    const code = String(randomInt(100_000, 1_000_000));
    const { error } = await adminClient.from('alexa_link_codes').insert({
      code,
      user_id: userId,
      company_id: companyId,
      expires_at: expiresAt,
    });
    if (!error) return { code, expiresAt, minutos: VIGENCIA_MINUTOS };
    if (error.code !== UNIQUE_VIOLATION) {
      logger.error({ err: error.message }, 'crearCodigoVinculacion');
      throw new Error(error.message);
    }
  }
  throw new Error('No se pudo generar un código libre');
}

export type ResultadoCanje =
  | { ok: true; empresa: string | null }
  | { ok: false; motivo: 'no_existe' | 'expirado' | 'usado' | 'error' };

/**
 * Canjea un código y deja el dispositivo de Alexa asociado al usuario dueño.
 */
export async function canjearCodigo(
  code: string,
  alexaUserId: string,
): Promise<ResultadoCanje> {
  const { data: registro, error: lecturaErr } = await adminClient
    .from('alexa_link_codes')
    .select('code, user_id, company_id, expires_at, used_at')
    .eq('code', code)
    .maybeSingle();

  // Sin esto, una tabla faltante o un permiso mal puesto se le reportaría al
  // usuario como "código inválido" y nadie encontraría la causa real.
  if (lecturaErr) {
    logger.error({ err: lecturaErr.message }, 'canjearCodigo: fallo al leer el código');
    return { ok: false, motivo: 'error' };
  }
  if (!registro) return { ok: false, motivo: 'no_existe' };
  if (registro.used_at) return { ok: false, motivo: 'usado' };
  if (new Date(registro.expires_at).getTime() < Date.now()) {
    return { ok: false, motivo: 'expirado' };
  }

  // Un Echo solo puede pertenecer a un usuario: se suelta del anterior antes de
  // reasignarlo, porque alexa_user_id tiene índice único.
  await adminClient
    .from('users')
    .update({ alexa_user_id: null })
    .eq('alexa_user_id', alexaUserId)
    .neq('id', registro.user_id);

  const { error } = await adminClient
    .from('users')
    .update({ alexa_user_id: alexaUserId })
    .eq('id', registro.user_id);
  if (error) {
    logger.error({ err: error.message }, 'canjearCodigo: no se pudo vincular');
    return { ok: false, motivo: 'error' };
  }

  await adminClient
    .from('alexa_link_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code', code);

  const { data: empresa } = await adminClient
    .from('companies')
    .select('name')
    .eq('id', registro.company_id)
    .maybeSingle();

  logger.info({ userId: registro.user_id }, 'Alexa vinculada por código');
  return { ok: true, empresa: empresa?.name ?? null };
}
