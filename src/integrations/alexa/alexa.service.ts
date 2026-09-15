import { adminClient } from '../../config/supabase';
import { logger } from '../../config/logger';
import { formatCOP } from '../../shared/format';
import { todayBogota } from '../../shared/dates';
import { createMovement } from '../../modules/movements/movements.service';
import { runCashEngine } from '../../modules/analysis/cash-engine';
import { processCompanyAlerts } from '../../modules/alerts/alerts.service';
import { parseSpanishAmount } from '../whatsapp/parser';
import {
  alexaAsk,
  alexaDelegate,
  alexaSpeak,
  cajaHablada,
  conLimiteAlexa,
  esTimeoutAlexa,
  runwayHablado,
} from './alexa.speech';
import {
  addPayable,
  addReceivable,
  buildAlerts,
  buildBriefing,
  issueInvoiceByVoice,
  markPayablePaid,
} from './alexa.actions';
import { canjearCodigo } from './alexa.link';

export { alexaSpeak };

/**
 * Intents que recolectan varios datos por voz. Alexa se encarga de preguntar
 * lo que falte y de confirmar antes de guardar; nosotros solo actuamos cuando
 * el diálogo terminó.
 */
const INTENTS_CON_DIALOGO = new Set([
  'AddPayableIntent',
  'AddReceivableIntent',
  'MarkPaidIntent',
  'IssueInvoiceIntent',
]);

/** Canjea el código dictado y responde según lo que pasó. */
async function vincularCuenta(slots: any, alexaUserId: string) {
  const dictado = slots?.codigo?.value ?? '';
  const code = String(dictado).replace(/\D/g, '');

  if (code.length !== 6) {
    return alexaSpeak(
      'Necesito el código de seis dígitos que aparece en la aplicación, en la sección Ajustes. Dímelo cuando lo tengas.',
      false,
    );
  }

  const r = await canjearCodigo(code, alexaUserId);
  if (r.ok) {
    const donde = r.empresa ? ` Ya puedes preguntarme por la caja de ${r.empresa}.` : '';
    return alexaAsk(`Listo, quedaste conectado.${donde}`);
  }

  const mensajes: Record<string, string> = {
    no_existe: 'Ese código no lo reconozco. Revisa que sea el que aparece en la aplicación.',
    expirado: 'Ese código ya venció. Genera uno nuevo en la aplicación y dímelo.',
    usado: 'Ese código ya se usó. Genera uno nuevo en la aplicación.',
    error: 'Algo falló al conectarte. Intenta de nuevo en un momento.',
  };
  return alexaSpeak(mensajes[r.motivo] ?? mensajes.error, false);
}

async function resolveUserByAlexaId(alexaUserId: string) {
  const { data } = await adminClient
    .from('users')
    .select('id, company_id')
    .eq('alexa_user_id', alexaUserId)
    .maybeSingle();
  return data ?? null;
}

/**
 * Procesa una petición del Alexa Skills Kit y devuelve la respuesta a hablar.
 * Soporta LaunchRequest e IntentRequest con consultas, informes y registro.
 */
export async function handleAlexaRequest(body: any) {
  const alexaUserId: string | undefined =
    body?.context?.System?.user?.userId ?? body?.session?.user?.userId;

  const requestType: string = body?.request?.type;

  if (requestType === 'LaunchRequest') {
    return alexaSpeak(
      'Bienvenido a PosBank. Puedes pedirme el informe del día, preguntar por tu caja, tu inventario o tus cuentas, y también registrar ventas, gastos y facturas.',
      false,
    );
  }

  if (requestType !== 'IntentRequest') {
    return alexaSpeak('Hasta pronto.');
  }

  if (!alexaUserId) return alexaSpeak('No pude identificar tu cuenta.');
  const userId: string = alexaUserId; // narrowing explícito: TS no lo retiene dentro de los closures de abajo.

  const intentName: string = body?.request?.intent?.name ?? '';
  const slots = body?.request?.intent?.slots ?? {};
  const dialogState: string | undefined = body?.request?.dialogState;
  const confirmacion: string = body?.request?.intent?.confirmationStatus ?? 'NONE';
  logger.info({ intentName, dialogState, confirmacion }, 'Alexa intent');

  // El límite de 6s cubre TODO lo que sigue, incluida la resolución del
  // usuario (resolveUserByAlexaId) y la vinculación por código. Antes solo
  // envolvía despacharIntent(): si la primera consulta a Supabase después de
  // inactividad pagaba el costo de una conexión fría, esa demora quedaba
  // fuera del reloj de seguridad y podía superar el límite duro de Alexa
  // (~8s) sin que conLimiteAlexa llegara a dispararse (visto en producción:
  // 9890ms de respuesta real, sin ningún log de ALEXA_TIMEOUT).
  try {
    return await conLimiteAlexa(procesarIntent());
  } catch (err) {
    if (esTimeoutAlexa(err)) {
      logger.error({ intentName }, 'Alexa: se superó el límite de tiempo, respuesta de emergencia');
      return alexaSpeak(
        'Estoy teniendo problemas para consultar tus datos en este momento. Intenta de nuevo en unos segundos.',
        false,
      );
    }
    throw err;
  }

  async function procesarIntent() {
    // La vinculación se atiende antes de exigir usuario, porque es justamente
    // lo que se usa cuando todavía no hay ninguno.
    if (intentName === 'LinkAccountIntent') {
      if (dialogState && dialogState !== 'COMPLETED') return alexaDelegate();
      return vincularCuenta(slots, userId);
    }

    const user = await resolveUserByAlexaId(userId);
    if (!user) {
      return alexaSpeak(
        'Tu Alexa todavía no está conectada a PosBank. Abre la aplicación, entra a Ajustes, y dime el código de seis dígitos que aparece ahí.',
        false,
      );
    }

    // Mientras Alexa siga pidiendo datos, le devolvemos el turno.
    if (INTENTS_CON_DIALOGO.has(intentName)) {
      if (dialogState && dialogState !== 'COMPLETED') return alexaDelegate();
      if (confirmacion === 'DENIED') return alexaAsk('Listo, no registré nada.');
    }

    const ctx = { companyId: user.company_id, userId: user.id, slots };
    return despacharIntent(ctx);
  }

  async function despacharIntent(ctx: { companyId: string; userId: string; slots: any }) {
  switch (intentName) {
    case 'AMAZON.StopIntent':
    case 'AMAZON.CancelIntent':
      return alexaSpeak('Hasta luego.');

    case 'BriefingIntent':
      return buildBriefing(ctx.companyId);

    case 'AlertsIntent':
      return buildAlerts(ctx.companyId);

    case 'AddPayableIntent':
      return addPayable(ctx);

    case 'AddReceivableIntent':
      return addReceivable(ctx);

    case 'MarkPaidIntent':
      return markPayablePaid(ctx);

    case 'IssueInvoiceIntent':
      return issueInvoiceByVoice(ctx);

    case 'CashStatusIntent': {
      const a = await runCashEngine(ctx.companyId);
      return alexaAsk(
        `Tu efectivo disponible es ${formatCOP(a.cashPosition.totalAvailable)} y tu caja está ${cajaHablada(a.cashPosition.state)}.`,
      );
    }
    case 'RunwayIntent': {
      const a = await runCashEngine(ctx.companyId);
      if (a.runway.days >= 9999) return alexaAsk('Tu runway es indefinido: no tienes gasto que lo consuma.');
      return alexaAsk(
        `Tu runway es de ${a.runway.days} días y está ${runwayHablado(a.runway.state)}.`,
      );
    }
    case 'PayablesIntent': {
      const a = await runCashEngine(ctx.companyId);
      const { data: proximos } = await adminClient
        .from('payables')
        .select('supplier_name, amount, due_date')
        .eq('company_id', ctx.companyId)
        .neq('status', 'paid')
        .order('due_date', { ascending: true })
        .limit(1);
      const total = formatCOP(a.cashPosition.totalPayables);
      if (!proximos || proximos.length === 0) {
        return alexaAsk(`Debes ${total} a proveedores. No tienes pagos pendientes registrados.`);
      }
      const p = proximos[0];
      return alexaAsk(
        `Debes ${total} a proveedores. El próximo pago es a ${p.supplier_name} por ${formatCOP(Number(p.amount))}, vence el ${p.due_date}.`,
      );
    }

    case 'ReceivablesIntent': {
      const a = await runCashEngine(ctx.companyId);
      const c = a.collection;
      if (c.totalOverdue > 0) {
        return alexaAsk(
          `Te deben ${formatCOP(a.cashPosition.totalReceivables)} en total. De eso, ${formatCOP(c.totalOverdue)} está vencido en ${c.overdueCount} facturas, con ${c.averageDaysOverdue} días de mora en promedio.`,
        );
      }
      return alexaAsk(
        `Te deben ${formatCOP(a.cashPosition.totalReceivables)} en total y no tienes cartera vencida.`,
      );
    }

    case 'InventoryIntent': {
      const { data: prods } = await adminClient
        .from('products')
        .select('name, stock, unit, category')
        .eq('company_id', ctx.companyId)
        .eq('is_active', true)
        .eq('category', 'finished')
        .order('stock', { ascending: true });
      const items = prods ?? [];
      if (items.length === 0) {
        return alexaAsk('No tienes producto terminado registrado en el inventario.');
      }
      const agotados = items.filter((p) => Number(p.stock) <= 0);
      const bajo = items[0];
      let texto = `Tienes ${items.length} ${items.length === 1 ? 'producto' : 'productos'} en inventario.`;
      if (agotados.length > 0) {
        texto += ` ${agotados.length} ${agotados.length === 1 ? 'está agotado' : 'están agotados'}: ${agotados.slice(0, 3).map((p) => p.name).join(', ')}.`;
      } else {
        texto += ` El de menor existencia es ${bajo.name}, con ${Number(bajo.stock)} ${bajo.unit}.`;
      }
      return alexaAsk(texto);
    }

    case 'SalesTodayIntent': {
      const today = todayBogota();
      const { data: facturas } = await adminClient
        .from('invoices')
        .select('total')
        .eq('company_id', ctx.companyId)
        .eq('status', 'issued')
        .gte('created_at', `${today}T00:00:00Z`);
      const lista = facturas ?? [];
      const total = lista.reduce((s, f) => s + Number(f.total), 0);
      if (lista.length === 0) {
        return alexaAsk('Hoy no has emitido facturas todavía.');
      }
      return alexaAsk(
        `Hoy llevas ${lista.length} ${lista.length === 1 ? 'factura' : 'facturas'} por ${formatCOP(total)}.`,
      );
    }

    case 'RegisterIncomeIntent':
    case 'RegisterExpenseIntent': {
      const amountRaw = slots?.monto?.value ?? slots?.amount?.value ?? '';
      const amount = parseSpanishAmount(String(amountRaw));
      if (!amount) {
        return alexaSpeak('No entendí el monto. Intenta de nuevo diciendo la cifra.', false);
      }
      const type = intentName === 'RegisterIncomeIntent' ? 'income' : 'expense';
      await createMovement(adminClient, {
        companyId: ctx.companyId,
        userId: ctx.userId,
        type,
        amount,
        category: type === 'income' ? 'sales' : 'other',
        sourceChannel: 'alexa',
        description: `Registro por Alexa`,
      });
      await processCompanyAlerts(ctx.companyId);
      const verb = type === 'income' ? 'ingreso' : 'gasto';
      return alexaAsk(`Listo. Registré un ${verb} de ${formatCOP(amount)}.`);
    }
    default:
      return alexaSpeak(
        'Puedes pedirme el informe del día, preguntar por tu caja, tu runway, cuánto debes, cuánto te deben, el inventario o las ventas. También puedo registrar una venta, un gasto, una cuenta por pagar o por cobrar, marcar una cuenta como pagada, o facturar un producto del inventario.',
        false,
      );
  }
  }
}
