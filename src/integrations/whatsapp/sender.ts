import { env } from '../../config/env';
import { logger } from '../../config/logger';

/**
 * Envía un mensaje de texto por WhatsApp. Soporta Meta Cloud API y Twilio según
 * WHATSAPP_PROVIDER. Si faltan credenciales, registra el mensaje en el log en
 * lugar de fallar (útil en desarrollo).
 */
export async function sendWhatsApp(to: string, body: string): Promise<void> {
  try {
    if (env.WHATSAPP_PROVIDER === 'meta') {
      await sendViaMeta(to, body);
    } else {
      await sendViaTwilio(to, body);
    }
  } catch (err) {
    logger.error({ err, to }, 'Fallo al enviar WhatsApp');
  }
}

async function sendViaMeta(to: string, body: string): Promise<void> {
  if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) {
    logger.info({ to, body }, '[WhatsApp:meta:dev] mensaje simulado');
    return;
  }
  const url = `https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });
  if (!res.ok) {
    throw new Error(`Meta API ${res.status}: ${await res.text()}`);
  }
}

async function sendViaTwilio(to: string, body: string): Promise<void> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM) {
    logger.info({ to, body }, '[WhatsApp:twilio:dev] mensaje simulado');
    return;
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const params = new URLSearchParams({
    To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    From: env.TWILIO_WHATSAPP_FROM,
    Body: body,
  });
  const auth = Buffer.from(
    `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`,
  ).toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`Twilio API ${res.status}: ${await res.text()}`);
  }
}
