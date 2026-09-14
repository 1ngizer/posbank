import express, { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { asyncHandler, ApiError, ok } from '../../shared/http';
import { requireAuth } from '../../middleware/auth';
import { detectMediaTypeFromMagicBytes, isSupportedMediaType, scanInvoiceImage } from './scan.service';

export const scanRouter = Router();

// Límite de consumo para escaneo con IA (cada llamada a Claude cuesta ~$0.014)
// Protege el saldo de Anthropic contra loops o consumo desmedido
const scanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20, // Máximo 20 escaneos cada 15 minutos por usuario / IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      ok: false,
      error: {
        code: 'rate_limit_exceeded',
        message: 'Has alcanzado el límite de escaneo de facturas (máximo 20 facturas cada 15 minutos). Por favor espera un momento.',
      },
    });
  },
});

// Las fotos de factura pesan más que el límite global de 1 MB del API.
const photoBody = express.json({ limit: '12mb' });

const schema = z.object({
  // base64 puro o data URL ("data:image/jpeg;base64,....").
  image: z.string().min(100, 'Imagen vacía o demasiado pequeña'),
  mediaType: z.string().optional(),
  kind: z.enum(['payable', 'receivable']).default('payable'),
});

/**
 * POST /api/v1/scan/invoice — lee una factura desde una foto.
 * Devuelve los campos extraídos para que el usuario los confirme; no crea nada.
 */
scanRouter.post(
  '/invoice',
  requireAuth,
  scanLimiter,
  photoBody,
  asyncHandler(async (req, res) => {
    const input = schema.parse(req.body);

    // Acepta data URL o base64 pelado.
    let base64 = input.image;
    const dataUrl = base64.match(/^data:[^;]+;base64,(.*)$/s);
    if (dataUrl) {
      base64 = dataUrl[1];
    }
    base64 = base64.replace(/\s/g, '');

    // Validación profunda por magic bytes: asegura que sea realmente una imagen
    // y no un ejecutable, script o binario malicioso.
    const detectedType = detectMediaTypeFromMagicBytes(base64);
    if (!detectedType || !isSupportedMediaType(detectedType)) {
      throw ApiError.badRequest(
        'El archivo proporcionado no es una imagen válida o compatible. Usa JPG, PNG, WebP o GIF.',
      );
    }

    const data = await scanInvoiceImage(base64, detectedType, input.kind);
    return ok(res, data);
  }),
);
