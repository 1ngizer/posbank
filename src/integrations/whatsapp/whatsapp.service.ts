import { adminClient } from '../../config/supabase';
import { logger } from '../../config/logger';
import { formatCOP } from '../../shared/format';
import { createMovement } from '../../modules/movements/movements.service';
import { runCashEngine } from '../../modules/analysis/cash-engine';
import { processCompanyAlerts } from '../../modules/alerts/alerts.service';
import { dispatchAlerts } from '../notifications';
import { parseMessage } from './parser';
import { interpretWithClaude } from './nlu';

const HELP_TEXT =
  'Soy PosBank 🤖. Puedes decirme:\n' +
  '• "Vendí 500 mil en efectivo" (registra un ingreso)\n' +
  '• "Pagué 120 mil de luz" (registra un egreso)\n' +
  '• "¿Cómo está mi caja?"\n' +
  '• "¿Cuánto me deben?"\n' +
  '• "¿Cuál es mi runway?"';

interface WaUser {
  id: string;
  company_id: string;
}

async function resolveUserByPhone(phone: string): Promise<WaUser | null> {
  // Normalizamos: comparamos por sufijo para tolerar prefijos (whatsapp:, +57…).
  const digits = phone.replace(/\D/g, '');
  const { data } = await adminClient
    .from('users')
    .select('id, company_id, phone_whatsapp')
    .not('phone_whatsapp', 'is', null);
  const match = (data ?? []).find((u) => {
    const uDigits = (u.phone_whatsapp ?? '').replace(/\D/g, '');
    return uDigits && (digits.endsWith(uDigits) || uDigits.endsWith(digits));
  });
  return match ? { id: match.id, company_id: match.company_id } : null;
}

/**
 * Procesa un mensaje entrante de WhatsApp y devuelve el texto de respuesta.
 * Registra movimientos o responde consultas. Tras un movimiento, recalcula y
 * despacha alertas críticas de forma proactiva.
 */
export async function handleIncomingMessage(
  fromPhone: string,
  text: string,
): Promise<string> {
  const user = await resolveUserByPhone(fromPhone);
  if (!user) {
    return 'No reconozco este número. Pídele al administrador de tu empresa que registre tu WhatsApp en PosBank.';
  }

  let intent = parseMessage(text);
  // El regex es rápido y cubre la mayoría de mensajes reales. Solo si falla
  // recurrimos a Claude (más lento y con costo) para lenguaje libre/jerga.
  if (intent.kind === 'unknown') {
    intent = await interpretWithClaude(text);
  }
  logger.info({ fromPhone, intent: intent.kind }, 'WhatsApp intent');

  switch (intent.kind) {
    case 'register_movement': {
      await createMovement(adminClient, {
        companyId: user.company_id,
        userId: user.id,
        type: intent.type,
        amount: intent.amount,
        category: intent.category,
        description: intent.description,
        sourceChannel: 'whatsapp',
      });

      // Recalcular y despachar alertas nuevas (críticas/warning) proactivamente.
      const { newAlerts } = await processCompanyAlerts(user.company_id);
      const urgent = newAlerts.filter(
        (a) => a.severity === 'critical' || a.severity === 'warning',
      );
      if (urgent.length > 0) {
        await dispatchAlerts(user.company_id, urgent);
      }

      const verb = intent.type === 'income' ? 'Ingreso' : 'Egreso';
      return `✅ ${verb} registrado: ${formatCOP(intent.amount)} (${intent.category}).`;
    }

    case 'query_cash': {
      const a = await runCashEngine(user.company_id);
      return (
        `💰 Tu caja hoy:\n` +
        `• Disponible: ${formatCOP(a.cashPosition.totalAvailable)}\n` +
        `• Por cobrar: ${formatCOP(a.cashPosition.totalReceivables)}\n` +
        `• Por pagar: ${formatCOP(a.cashPosition.totalPayables)}\n` +
        `• Posición neta: ${formatCOP(a.cashPosition.netPosition)}\n` +
        `Estado: ${cashStateLabel(a.cashPosition.state)}`
      );
    }

    case 'query_receivables': {
      const a = await runCashEngine(user.company_id);
      const c = a.collection;
      if (c.totalOverdue > 0) {
        return `📥 Te deben ${formatCOP(a.cashPosition.totalReceivables)} en total. Vencido: ${formatCOP(c.totalOverdue)} (${c.overdueCount} facturas, ${c.averageDaysOverdue} días promedio de mora).`;
      }
      return `📥 Te deben ${formatCOP(a.cashPosition.totalReceivables)} en total. Sin cartera vencida. 👍`;
    }

    case 'query_payables': {
      const a = await runCashEngine(user.company_id);
      return `📤 Debes ${formatCOP(a.cashPosition.totalPayables)} a proveedores. Próximos pagos: ${formatCOP(a.payment.upcomingPayments)}.`;
    }

    case 'query_runway': {
      const a = await runCashEngine(user.company_id);
      const days = a.runway.days >= 9999 ? 'indefinido' : `${a.runway.days} días`;
      return `⏱️ Tu runway es de ${days} (estado: ${runwayStateLabel(a.runway.state)}), al ritmo de gasto actual.`;
    }

    case 'help':
      return HELP_TEXT;

    case 'unknown':
    default:
      return `No entendí el mensaje. ${HELP_TEXT}`;
  }
}

function cashStateLabel(s: string): string {
  return (
    {
      surplus: 'Excedente (puedes invertir)',
      sufficient: 'Suficiente',
      tight: 'Ajustada (precaución)',
      deficit: 'Déficit (urgente)',
    }[s] ?? s
  );
}

function runwayStateLabel(s: string): string {
  return (
    {
      solid: 'Sólido',
      stable: 'Estable',
      alert: 'Alerta',
      emergency: 'Emergencia',
    }[s] ?? s
  );
}
