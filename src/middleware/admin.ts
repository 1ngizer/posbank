import { NextFunction, Request, Response } from 'express';
import { adminClient } from '../config/supabase';
import { env } from '../config/env';
import { ApiError, asyncHandler } from '../shared/http';

/** Correos autorizados como admin de plataforma (normalizados a minúscula). */
const ADMIN_EMAILS = new Set(
  env.PLATFORM_ADMIN_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export function isPlatformAdmin(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.has(email.toLowerCase());
}

/** Contexto de admin colgado en req.admin. */
export interface AdminContext {
  authUserId: string;
  email: string;
}
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminContext;
    }
  }
}

/**
 * Exige que el usuario autenticado sea admin de plataforma. NO requiere perfil
 * de empresa (el admin no pertenece a un tenant). Los endpoints admin usan
 * adminClient (service_role) para agregar datos de TODOS los clientes.
 */
export const requirePlatformAdmin = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) throw ApiError.unauthorized('Falta el token Bearer');

    const { data, error } = await adminClient.auth.getUser(token);
    if (error || !data?.user) throw ApiError.unauthorized('Token inválido o expirado');

    const email = data.user.email ?? '';
    if (!isPlatformAdmin(email)) {
      throw ApiError.forbidden('No tienes acceso al panel de administrador');
    }
    req.admin = { authUserId: data.user.id, email };
    next();
  },
);
