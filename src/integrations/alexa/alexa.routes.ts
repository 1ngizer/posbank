import { Router } from 'express';
import { asyncHandler, ok } from '../../shared/http';
import { requireAuth } from '../../middleware/auth';
import { handleAlexaRequest } from './alexa.service';
import { verifyAlexaRequest } from './alexa.verify';
import { crearCodigoVinculacion } from './alexa.link';

export const alexaRouter = Router();

// POST /api/v1/alexa/intent — endpoint del Alexa Skills Kit.
// verifyAlexaRequest exige applicationId correcto + firma de Amazon antes de
// ejecutar cualquier acción: sin esto, cualquiera con un alexa_user_id podía
// llamar este endpoint directamente y mover datos reales.
alexaRouter.post(
  '/intent',
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
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const codigo = await crearCodigoVinculacion(a.userId, a.companyId);
    return ok(res, codigo, 201);
  }),
);
