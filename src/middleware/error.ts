import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../shared/http';
import { logger } from '../config/logger';

/** 404 para rutas no registradas. */
export function notFound(req: Request, res: Response) {
  res.status(404).json({
    ok: false,
    error: { code: 'not_found', message: `Ruta no encontrada: ${req.method} ${req.path}` },
  });
}

/** Manejador central de errores. Traduce ZodError y ApiError a JSON uniforme. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'validation_error',
        message: 'Datos inválidos',
        details: err.flatten().fieldErrors,
      },
    });
  }

  if (err instanceof ApiError) {
    if (err.statusCode >= 500) logger.error({ err }, err.message);
    return res.status(err.statusCode).json({
      ok: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  logger.error({ err }, 'Error no controlado');
  return res.status(500).json({
    ok: false,
    error: { code: 'internal_error', message: 'Error interno del servidor' },
  });
}
