import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler, ok } from '../../shared/http';
import { requireAuth } from '../../middleware/auth';
import { adminClient, authClient } from '../../config/supabase';
import { logger } from '../../config/logger';
import { loginSchema, registerSchema } from './auth.schemas';
import { completeOnboarding, registerCompanyAndOwner, signIn } from './auth.service';

import { rateLimit } from 'express-rate-limit';

export const authRouter = Router();

// Limiter estricto para prevenir ataques de fuerza bruta en autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // Limita a 10 peticiones por IP cada 15 minutos
  message: 'Demasiados intentos de inicio de sesión. Por favor, espera 15 minutos.',
  standardHeaders: true, // Retorna info del límite en headers `RateLimit-*`
  legacyHeaders: false, // Deshabilita los headers `X-RateLimit-*`
});

/**
 * Valida el JWT y devuelve el auth user, SIN exigir perfil de empresa.
 * Necesario para el onboarding: quien entra con Google está autenticado pero
 * todavía no pertenece a ninguna empresa.
 */
async function authUserFromRequest(authHeader?: string) {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) throw ApiError.unauthorized('Falta el token Bearer');
  const { data, error } = await adminClient.auth.getUser(token);
  if (error || !data?.user) throw ApiError.unauthorized('Token inválido o expirado');
  return data.user;
}

// POST /api/v1/auth/register — crea empresa + usuario dueño y devuelve sesión.
authRouter.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const result = await registerCompanyAndOwner(input);
    return ok(res, result, 201);
  }),
);

// POST /api/v1/auth/login
authRouter.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const result = await signIn(input);
    return ok(res, result);
  }),
);

// POST /api/v1/auth/forgot-password — solicita enlace de recuperación de contraseña
const forgotPasswordSchema = z.object({
  email: z.string().email('Correo inválido'),
  redirectTo: z.string().url().optional(),
});

authRouter.post(
  '/forgot-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = forgotPasswordSchema.parse(req.body);
    const redirectUrl =
      input.redirectTo ||
      `${req.headers.origin || 'https://app.posbank.ingizer.com'}/reset-password`;

    const { error } = await authClient.auth.resetPasswordForEmail(input.email, {
      redirectTo: redirectUrl,
    });

    if (error) {
      logger.warn({ err: error, email: input.email }, 'Error solicitando reset de contraseña');
    }

    // Por seguridad (evitar enumeración de usuarios), siempre retornamos ok
    return ok(res, {
      message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.',
    });
  }),
);

// POST /api/v1/auth/reset-password — actualiza la contraseña del usuario autenticado (vía token de recuperación)
const resetPasswordSchema = z.object({
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

authRouter.post(
  '/reset-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = resetPasswordSchema.parse(req.body);
    const { error } = await adminClient.auth.admin.updateUserById(req.auth!.authUserId, {
      password: input.password,
    });

    if (error) {
      throw ApiError.badRequest(error.message);
    }

    return ok(res, { message: 'Contraseña actualizada exitosamente.' });
  }),
);

// GET /api/v1/auth/me — perfil del usuario autenticado.
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    return ok(res, {
      userId: a.userId,
      companyId: a.companyId,
      role: a.role,
      email: a.email,
    });
  }),
);

/**
 * POST /api/v1/auth/onboarding — crea la empresa de un usuario ya autenticado
 * que aún no tiene una (típicamente el que acaba de entrar con Google).
 * El correo se toma del token verificado, nunca del body.
 */
const onboardingSchema = z.object({
  companyName: z.string().min(2, 'Nombre de empresa requerido'),
  name: z.string().optional(),
  nit: z.string().optional(),
  minimumCashReserve: z.coerce.number().min(0).optional(),
});
authRouter.post(
  '/onboarding',
  asyncHandler(async (req, res) => {
    const user = await authUserFromRequest(req.headers.authorization);
    const input = onboardingSchema.parse(req.body);
    const profile = await completeOnboarding({
      authUserId: user.id,
      email: user.email ?? '',
      companyName: input.companyName,
      name: input.name ?? (user.user_metadata?.full_name as string | undefined),
      nit: input.nit,
      minimumCashReserve: input.minimumCashReserve,
    });
    return ok(res, profile, profile.created ? 201 : 200);
  }),
);
