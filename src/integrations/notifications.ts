import { adminClient } from '../config/supabase';
import { logger } from '../config/logger';
import { GeneratedAlert } from '../shared/types';
import { sendWhatsApp } from './whatsapp/sender';

const EMOJI = {
  critical: '🔴',
  warning: '🟡',
  info: '🔵',
  opportunity: '🟢',
} as const;

/** Formatea una alerta como mensaje de WhatsApp en tono gerencial. */
export function formatAlertText(a: GeneratedAlert): string {
  return `${EMOJI[a.severity]} *${a.title}*\n${a.message}\n\n➡️ ${a.suggestedAction}\n\n_PosBank · Un banco en el punto de pago._`;
}

/**
 * Despacha las alertas de una empresa a sus usuarios por WhatsApp. Respeta las
 * preferencias de alerta de la empresa (settings.alert_preferences.whatsapp).
 * Los canales Alexa/App/email se consultan desde sus propias superficies.
 */
export async function dispatchAlerts(
  companyId: string,
  alerts: GeneratedAlert[],
): Promise<void> {
  if (alerts.length === 0) return;

  const { data: company } = await adminClient
    .from('companies')
    .select('settings')
    .eq('id', companyId)
    .single();
  const prefs = (company?.settings as { alert_preferences?: { whatsapp?: boolean } })
    ?.alert_preferences;
  if (prefs?.whatsapp === false) {
    logger.info({ companyId }, 'WhatsApp desactivado por preferencias; no se despacha');
    return;
  }

  // Destinatarios: owners y managers con teléfono registrado.
  const { data: recipients } = await adminClient
    .from('users')
    .select('phone_whatsapp, role')
    .eq('company_id', companyId)
    .in('role', ['owner', 'manager'])
    .not('phone_whatsapp', 'is', null);

  const phones = (recipients ?? [])
    .map((r) => r.phone_whatsapp)
    .filter((p): p is string => !!p);

  for (const alert of alerts) {
    const text = formatAlertText(alert);
    for (const phone of phones) {
      await sendWhatsApp(phone, text);
    }
  }
}
