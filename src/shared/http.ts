import { NextFunction, Request, Response } from 'express';

/** Error HTTP con status conocido. Lo captura el middleware de errores. */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = 'error',
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(msg: string, details?: unknown) {
    return new ApiError(400, msg, 'bad_request', details);
  }
  static unauthorized(msg = 'No autenticado') {
    return new ApiError(401, msg, 'unauthorized');
  }
  static forbidden(msg = 'Sin permiso') {
    return new ApiError(403, msg, 'forbidden');
  }
  static notFound(msg = 'No encontrado') {
    return new ApiError(404, msg, 'not_found');
  }
  static conflict(msg: string) {
    return new ApiError(409, msg, 'conflict');
  }
}

/** Envuelve un handler async y reenvía errores a next() sin try/catch repetido. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Respuesta OK estandarizada. */
export function ok(res: Response, data: unknown, status = 200) {
  return res.status(status).json({ ok: true, data });
}
