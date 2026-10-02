import express, { Router } from 'express';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { asyncHandler } from '../../shared/http';
import { handleIncomingMessage } from './whatsapp.service';
import { sendWhatsApp } from './sender';

export const whatsappRouter = Router();

/**
 * GET /api/v1/webhooks/whatsapp/incoming — verificación del webhook de Meta.
 * Meta hace un GET con hub.challenge al configurar el webhook.
 */
whatsappRouter.get('/incoming', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('Webhook de WhatsApp verificado');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

import crypto from 'crypto';

/**
 * POST /api/v1/webhooks/whatsapp/incoming — mensajes entrantes.
 * Soporta el formato de Meta Cloud API (JSON) y el de Twilio (form-urlencoded).
 */
whatsappRouter.post(
  '/incoming',
  asyncHandler(async (req, res) => {
    // Verificación de Firma (X-Hub-Signature-256) para Meta Cloud API
    if (env.WHATSAPP_PROVIDER === 'meta' && env.WHATSAPP_APP_SECRET) {
      const signature = req.headers['x-hub-signature-256'];
      const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;
      
      if (!signature || typeof signature !== 'string' || !rawBody) {
        logger.warn('Falta firma o rawBody en el webhook de WhatsApp');
        res.sendStatus(403);
        return;
      }
      
      const expectedSignature = 'sha256=' + crypto.createHmac('sha256', env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex');
      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expectedSignature);

      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        logger.warn('Firma de webhook de WhatsApp inválida. Posible ataque de spoofing.');
        res.sendStatus(403);
        return;
      }
    }

    // Respondemos 200 de inmediato; procesamos y contestamos por API.
    res.sendStatus(200);

    const messages = extractMessages(req.body);
    for (const msg of messages) {
      try {
        const reply = await handleIncomingMessage(msg.from, msg.text);
        await sendWhatsApp(msg.from, reply);
      } catch (err) {
        logger.error({ err, from: msg.from }, 'Error procesando mensaje WhatsApp');
      }
    }
  }),
);

interface IncomingMsg {
  from: string;
  text: string;
}

/** Normaliza el payload de Meta o Twilio a una lista de mensajes. */
function extractMessages(body: unknown): IncomingMsg[] {
  const b = body as Record<string, unknown>;

  // Twilio: { From: 'whatsapp:+57...', Body: '...' }
  if (b && typeof b.From === 'string' && typeof b.Body === 'string') {
    return [{ from: b.From, text: b.Body }];
  }

  // Meta Cloud API: entry[].changes[].value.messages[]
  const out: IncomingMsg[] = [];
  const entries = (b?.entry as any[]) ?? [];
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      for (const m of change?.value?.messages ?? []) {
        if (m?.type === 'text' && m?.text?.body) {
          out.push({ from: m.from, text: m.text.body });
        }
      }
    }
  }
  return out;
}
