import { NextFunction, Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, userClient } from '../config/supabase';
import { ApiError, asyncHandler } from '../shared/http';
import { UserRole } from '../shared/types';

/** Contexto autenticado que colgamos en req.auth. */
export interface AuthContext {
  accessToken: string;
  authUserId: string; // uid de Supabase Auth
  userId: string; // id en tabla users
  companyId: string;
  role: UserRole;
  email: string;
  /** Cliente Supabase que respeta RLS en nombre del usuario. */
  db: SupabaseClient;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

/**
 * Verifica el JWT de Supabase Auth, resuelve el perfil (users → company_id, role)
 * y expone un cliente RLS por-request. Todo endpoint de negocio pasa por aquí.
 */
export const requireAuth = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) throw ApiError.unauthorized('Falta el token Bearer');

    // Validamos el token contra Supabase Auth.
    const { data: userData, error } = await adminClient.auth.getUser(token);
    if (error || !userData?.user) {
      throw ApiError.unauthorized('Token inválido o expirado');
    }
    const authUserId = userData.user.id;

    // Resolvemos el perfil de negocio (tenant). Usamos adminClient para leer la
    // fila del propio usuario sin depender aún de RLS.
    const { data: profile, error: pErr } = await adminClient
      .from('users')
      .select('id, company_id, role, email')
      .eq('id', authUserId)
      .single();

    if (pErr || !profile) {
      throw ApiError.forbidden('Usuario sin perfil de empresa asignado');
    }

    req.auth = {
      accessToken: token,
      authUserId,
      userId: profile.id,
      companyId: profile.company_id,
      role: profile.role as UserRole,
      email: profile.email,
      db: userClient(token),
    };
    next();
  },
);

/** Restringe un endpoint a ciertos roles. Usar después de requireAuth. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(ApiError.unauthorized());
    if (!roles.includes(req.auth.role)) {
      return next(ApiError.forbidden('Rol sin permiso para esta acción'));
    }
    next();
  };
}
