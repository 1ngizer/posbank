import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { asyncHandler, ok } from '../../shared/http';
import { requireAuth } from '../../middleware/auth';
import { handleAlexaRequest } from './alexa.service';
import { verifyAlexaRequest } from './alexa.verify';
import { crearCodigoVinculacion } from './alexa.link';

export const alexaRouter = Router();

const alexaIntentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120, // 120 peticiones cada 15 min
  message: 'Demasiadas solicitudes al asistente de voz.',
  standardHeaders: true,
  legacyHeaders: false,
});

const linkCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15, // Máximo 15 generaciones de código por usuario cada 15 min
  message: 'Has generado demasiados códigos de vinculación. Espera unos minutos.',
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/v1/alexa/intent — endpoint del Alexa Skills Kit.
alexaRouter.post(
  '/intent',
  alexaIntentLimiter,
  verifyAlexaRequest,
  asyncHandler(async (req, res) => {
    const response = await handleAlexaRequest(req.body);
    return res.json(response);
  }),
);

// POST /api/v1/alexa/link-code — código para vincular el Alexa del usuario.
alexaRouter.post(
  '/link-code',
  requireAuth,
  linkCodeLimiter,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const codigo = await crearCodigoVinculacion(a.userId, a.companyId);
    return ok(res, codigo, 201);
  }),
);
