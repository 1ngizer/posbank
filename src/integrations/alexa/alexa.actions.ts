import { adminClient } from '../../config/supabase';
import { logger } from '../../config/logger';
import { formatCOP } from '../../shared/format';
import { todayBogota } from '../../shared/dates';
import { createMovement } from '../../modules/movements/movements.service';
import { runCashEngine } from '../../modules/analysis/cash-engine';
import { processCompanyAlerts } from '../../modules/alerts/alerts.service';
import { issueInvoice } from '../../modules/pos/pos.service';
import {
  alexaAsk,
  cajaHablada,
  isFullDate,
  slotNumber,
  slotValue,
  spokenDate,
} from './alexa.speech';

/**
 * Acciones de Alexa que escriben en la base o componen informes largos.
 * Las consultas simples viven en alexa.service.ts.
 */

export interface ActionContext {
  companyId: string;
  userId: string;
  slots: Record<string, { value?: string } | undefined> | undefined;
}

/** Compara nombres ignorando tildes y mayúsculas: la voz nunca acierta ambas. */
function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
}

// ─── Cuentas por pagar ──────────────────────────────────────────────

export async function addPayable(ctx: ActionContext) {
  const proveedor = slotValue(ctx.slots, 'tercero');
  const monto = slotNumber(ctx.slots, 'monto');
  const vence = slotValue(ctx.slots, 'fecha');

  if (!proveedor || !monto || !isFullDate(vence)) {
    return alexaAsk(
      'Me faltó un dato. Dime otra vez: agrega una cuenta por pagar, y te voy preguntando.',
    );
  }

  const { error } = await adminClient.from('payables').insert({
    company_id: ctx.companyId,
    supplier_name: proveedor,
    amount: monto,
    due_date: vence,
    status: 'pending',
    early_payment_discount_pct: 0,
  });
  if (error) {
    logger.error({ err: error.message }, 'Alexa addPayable');
    return alexaAsk('No pude guardar la cuenta. Intenta desde la aplicación.');
  }

  await processCompanyAlerts(ctx.companyId);
  return alexaAsk(
    `Listo. Registré una cuenta por pagar a ${proveedor} por ${formatCOP(monto)}, vence el ${spokenDate(vence)}.`,
  );
}

// ─── Cuentas por cobrar ─────────────────────────────────────────────

export async function addReceivable(ctx: ActionContext) {
  const cliente = slotValue(ctx.slots, 'tercero');
  const monto = slotNumber(ctx.slots, 'monto');
  const vence = slotValue(ctx.slots, 'fecha');

  if (!cliente || !monto || !isFullDate(vence)) {
    return alexaAsk(
      'Me faltó un dato. Dime otra vez: agrega una cuenta por cobrar, y te voy preguntando.',
    );
  }

  const { error } = await adminClient.from('receivables').insert({
    company_id: ctx.companyId,
    client_name: cliente,
    amount: monto,
    due_date: vence,
    status: 'pending',
    days_overdue: 0,
  });
  if (error) {
    logger.error({ err: error.message }, 'Alexa addReceivable');
    return alexaAsk('No pude guardar la cuenta. Intenta desde la aplicación.');
  }

  await processCompanyAlerts(ctx.companyId);
  return alexaAsk(
    `Listo. Registré que ${cliente} te debe ${formatCOP(monto)}, con vencimiento el ${spokenDate(vence)}.`,
  );
}

// ─── Marcar una cuenta como pagada ──────────────────────────────────

/**
 * Busca la cuenta abierta del proveedor dictado, la marca pagada y registra la
 * salida de caja. Si hay varias del mismo proveedor toma la que vence primero
 * y lo dice en voz alta, para que el usuario pueda corregir en la app.
 */
export async function markPayablePaid(ctx: ActionContext) {
  const proveedor = slotValue(ctx.slots, 'tercero');
  if (!proveedor) return alexaAsk('¿A qué proveedor le pagaste?');

  const { data } = await adminClient
    .from('payables')
    .select('id, supplier_name, amount, due_date')
    .eq('company_id', ctx.companyId)
    .neq('status', 'paid')
    .order('due_date', { ascending: true });

  const abiertas = data ?? [];
  const q = normalizar(proveedor);
  const coincidencias = abiertas.filter((p) => {
    const n = normalizar(p.supplier_name);
    return n.includes(q) || q.includes(n);
  });

  if (coincidencias.length === 0) {
    return alexaAsk(`No encontré cuentas pendientes de ${proveedor}.`);
  }

  const p = coincidencias[0];
  const monto = Number(p.amount);

  const { error } = await adminClient
    .from('payables')
    .update({ status: 'paid' })
    .eq('id', p.id)
    .eq('company_id', ctx.companyId);
  if (error) {
    logger.error({ err: error.message }, 'Alexa markPayablePaid');
    return alexaAsk('No pude marcarla como pagada. Intenta desde la aplicación.');
  }

  await createMovement(adminClient, {
    companyId: ctx.companyId,
    userId: ctx.userId,
    type: 'expense',
    amount: monto,
    category: 'suppliers',
    sourceChannel: 'alexa',
    description: `Pago a ${p.supplier_name} registrado por voz`,
  });
  await processCompanyAlerts(ctx.companyId);

  const extra =
    coincidencias.length > 1
      ? ` Tenías ${coincidencias.length} cuentas con ${p.supplier_name}; marqué la que vencía primero, la del ${spokenDate(p.due_date)}.`
      : '';
  return alexaAsk(
    `Listo. Marqué como pagada la cuenta de ${p.supplier_name} por ${formatCOP(monto)} y la descargué de tu caja.${extra}`,
  );
}

// ─── Facturación por voz ────────────────────────────────────────────

/**
 * Busca el producto dictado en el inventario terminado y emite una factura de
 * un solo producto. Aquí se mueve plata y stock real: si el nombre dictado no
 * encuentra una coincidencia única, NO factura nada — pide que se aclare en
 * vez de adivinar cuál producto era.
 */
export async function issueInvoiceByVoice(ctx: ActionContext) {
  const dictado = slotValue(ctx.slots, 'producto');
  const cantidad = slotNumber(ctx.slots, 'cantidad') ?? 1;

  if (!dictado) return alexaAsk('¿Qué producto quieres facturar?');

  const { data: prods } = await adminClient
    .from('products')
    .select('id, name, price, stock, unit')
    .eq('company_id', ctx.companyId)
    .eq('is_active', true)
    .eq('category', 'finished');

  const items = prods ?? [];
  const q = normalizar(dictado);
  const coincidencias = items.filter((p) => {
    const n = normalizar(p.name);
    return n.includes(q) || q.includes(n);
  });

  if (coincidencias.length === 0) {
    return alexaAsk(
      `No encontré "${dictado}" en el inventario. Revisa el nombre exacto en la aplicación e intenta de nuevo.`,
    );
  }
  if (coincidencias.length > 1) {
    const nombres = coincidencias.slice(0, 4).map((p) => p.name).join(', ');
    return alexaAsk(`Encontré varios productos parecidos: ${nombres}. Dime el nombre más exacto.`);
  }

  const p = coincidencias[0];
  const stock = Number(p.stock);
  if (cantidad > stock) {
    return alexaAsk(
      `Solo tienes ${stock} ${p.unit} de ${p.name} en inventario, no alcanza para ${cantidad}.`,
    );
  }

  try {
    const factura = await issueInvoice(adminClient, ctx.companyId, ctx.userId, {
      items: [{ productId: p.id, quantity: cantidad }],
      sourceChannel: 'alexa',
    });
    await processCompanyAlerts(ctx.companyId);
    return alexaAsk(
      `Listo. Facturé ${cantidad} ${p.unit} de ${p.name} a ${formatCOP(Number(p.price))} cada uno, total ${formatCOP(Number(factura.total))}. Factura ${factura.number}.`,
    );
  } catch (err) {
    logger.error({ err }, 'Alexa issueInvoiceByVoice');
    return alexaAsk('No pude emitir la factura. Intenta desde la aplicación.');
  }
}

// ─── Informe hablado ────────────────────────────────────────────────

/**
 * Resumen completo del negocio en una sola respuesta. Es lo que reemplaza
 * "abrir la aplicación a ver cómo vamos".
 */
export async function buildBriefing(companyId: string) {
  const hoy = todayBogota();

  // Ninguna de estas cuatro consultas depende del resultado de las demás, así
  // que corren en paralelo en vez de esperar primero al motor de caja y
  // encadenar un segundo viaje de red completo después.
  const [a, proximo, facturasHoy, alertas] = await Promise.all([
    runCashEngine(companyId),
    adminClient
      .from('payables')
      .select('supplier_name, amount, due_date')
      .eq('company_id', companyId)
      .neq('status', 'paid')
      .order('due_date', { ascending: true })
      .limit(1),
    adminClient
      .from('invoices')
      .select('total')
      .eq('company_id', companyId)
      .eq('status', 'issued')
      .gte('created_at', `${hoy}T00:00:00Z`),
    adminClient
      .from('alerts')
      .select('title, severity')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  const partes: string[] = [];

  partes.push(
    `Tienes ${formatCOP(a.cashPosition.totalAvailable)} disponibles y tu caja está ${cajaHablada(a.cashPosition.state)}.`,
  );
  partes.push(
    a.runway.days >= 9999
      ? 'Tu runway es indefinido.'
      : `Con el gasto actual te alcanza para ${a.runway.days} días.`,
  );

  const ventas = facturasHoy.data ?? [];
  if (ventas.length > 0) {
    const total = ventas.reduce((s, f) => s + Number(f.total), 0);
    partes.push(
      `Hoy llevas ${ventas.length} ${ventas.length === 1 ? 'factura' : 'facturas'} por ${formatCOP(total)}.`,
    );
  } else {
    partes.push('Hoy todavía no has facturado.');
  }

  if (a.collection.totalOverdue > 0) {
    partes.push(
      `Te deben ${formatCOP(a.cashPosition.totalReceivables)}, y ${formatCOP(a.collection.totalOverdue)} ya está vencido.`,
    );
  } else {
    partes.push(`Te deben ${formatCOP(a.cashPosition.totalReceivables)}, sin cartera vencida.`);
  }

  const prox = proximo.data?.[0];
  if (prox) {
    partes.push(
      `Debes ${formatCOP(a.cashPosition.totalPayables)}. El próximo pago es a ${prox.supplier_name} por ${formatCOP(Number(prox.amount))}, el ${spokenDate(prox.due_date)}.`,
    );
  } else {
    partes.push('No tienes pagos pendientes.');
  }

  const lista = alertas.data ?? [];
  if (lista.length > 0) {
    partes.push(`Tienes ${lista.length} ${lista.length === 1 ? 'alerta' : 'alertas'}. La más reciente: ${lista[0].title}.`);
  }

  return alexaAsk(partes.join(' '));
}

// ─── Alertas ────────────────────────────────────────────────────────

export async function buildAlerts(companyId: string) {
  const { data } = await adminClient
    .from('alerts')
    .select('title, message, severity')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(3);

  const lista = data ?? [];
  if (lista.length === 0) return alexaAsk('No tienes alertas activas. Todo en orden.');

  const texto = lista.map((x, i) => `${i + 1}. ${x.title}. ${x.message}`).join(' ');
  return alexaAsk(`Tienes ${lista.length} ${lista.length === 1 ? 'alerta' : 'alertas'}. ${texto}`);
}
