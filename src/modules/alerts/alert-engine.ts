import { CashAnalysis, GeneratedAlert, AlertChannel, AlertSeverity } from '../../shared/types';
import { formatCOPShort } from '../../shared/format';

/**
 * AlertEngine — a partir del CashAnalysis genera alertas con lenguaje gerencial
 * (no contable) y acción sugerida concreta. Lógica pura → testeable.
 *
 * Severidades y canal por defecto (según el prompt):
 *   critical    → WhatsApp inmediato (+ Alexa)
 *   warning     → WhatsApp resumen diario
 *   info        → App (+ WhatsApp) — sugerencias de configuración
 *   opportunity → WhatsApp semanal
 */

// Canal primario por severidad.
const CHANNEL_BY_SEVERITY: Record<AlertSeverity, AlertChannel> = {
  critical: 'whatsapp',
  warning: 'whatsapp',
  info: 'app',
  opportunity: 'whatsapp',
};

// Umbral: cartera vencida crítica si supera este % del flujo mensual.
const OVERDUE_CRITICAL_RATIO = 0.2;
const OVERDUE_CRITICAL_DAYS = 60;

function alert(
  a: CashAnalysis,
  severity: AlertSeverity,
  category: GeneratedAlert['category'],
  title: string,
  message: string,
  suggestedAction: string,
): GeneratedAlert {
  return {
    companyId: a.companyId,
    severity,
    category,
    title,
    message,
    suggestedAction,
    channelSent: CHANNEL_BY_SEVERITY[severity],
    dedupeKey: `${category}:${severity}`,
  };
}

export function generateAlerts(a: CashAnalysis): GeneratedAlert[] {
  const out: GeneratedAlert[] = [];
  const $ = formatCOPShort;

  // ─── CRÍTICAS ─────────────────────────────────────────────────────
  if (a.runway.state === 'emergency') {
    out.push(
      alert(
        a,
        'critical',
        'runway',
        'Emergencia de liquidez',
        `Tu runway es de ${a.runway.days} días con el efectivo disponible actual (${$(a.runway.availableCash)}).`,
        'Acelera el cobro de cartera vencida hoy y frena gastos no esenciales. Revisa las facturas por cobrar más antiguas.',
      ),
    );
  }

  if (a.cashPosition.state === 'deficit') {
    out.push(
      alert(
        a,
        'critical',
        'cash_position',
        'Déficit de caja',
        `Tu efectivo disponible (${$(a.cashPosition.totalAvailable)}) no alcanza a cubrir los compromisos próximos.`,
        'Prioriza cobros inmediatos o negocia plazos con proveedores para liberar caja esta semana.',
      ),
    );
  }

  // Cartera vencida crítica: > 60 días y > 20% del flujo mensual.
  const monthlyFlow = a.runway.monthlyBurn;
  const overdueRatioHigh =
    monthlyFlow > 0 && a.collection.totalOverdue > OVERDUE_CRITICAL_RATIO * monthlyFlow;
  if (
    a.collection.overdueCount > 0 &&
    a.collection.averageDaysOverdue > OVERDUE_CRITICAL_DAYS &&
    overdueRatioHigh
  ) {
    out.push(
      alert(
        a,
        'critical',
        'collection',
        'Cartera vencida crítica',
        `Tienes ${$(a.collection.totalOverdue)} en cartera vencida (${a.collection.overdueCount} facturas, promedio ${a.collection.averageDaysOverdue} días de mora).`,
        'Contacta hoy a los clientes con mayor mora. Esta cartera representa más del 20% de tu flujo mensual.',
      ),
    );
  }

  // ─── PRECAUCIÓN ───────────────────────────────────────────────────
  if (a.cashPosition.state === 'tight') {
    out.push(
      alert(
        a,
        'warning',
        'cash_position',
        'Caja ajustada',
        `Cubres tus compromisos, pero tu colchón quedó por debajo de la reserva mínima. Disponible: ${$(a.cashPosition.totalAvailable)}.`,
        'Evita gastos grandes esta semana y adelanta cobros pendientes para recomponer la reserva.',
      ),
    );
  }

  // Ventas por debajo de la meta: at_risk (80-99%) o critical (<80%).
  if ((a.sales.state === 'at_risk' || a.sales.state === 'critical') && a.flags.hasBudget) {
    const faltante = Math.max(0, a.sales.budget - a.sales.actual);
    out.push(
      alert(
        a,
        'warning',
        'sales',
        'Ventas por debajo de la meta',
        `Llevas ${$(a.sales.actual)} de ${$(a.sales.budget)} presupuestados (${a.sales.percentage}%).`,
        `Necesitas ${$(faltante)} adicionales. Revisa propuestas pendientes y acelera cierres antes de fin de mes.`,
      ),
    );
  }

  if (a.costs.state === 'review' || a.costs.state === 'deviated') {
    out.push(
      alert(
        a,
        'warning',
        'costs',
        'Costos sobre presupuesto',
        `Tus costos van ${a.costs.overBudgetPct}% por encima del presupuesto (${$(a.costs.actual)} vs ${$(a.costs.budget)}).`,
        'Revisa las categorías de mayor gasto y ajusta antes del cierre del mes.',
      ),
    );
  }

  if (a.runway.state === 'alert') {
    out.push(
      alert(
        a,
        'warning',
        'runway',
        'Runway en zona de alerta',
        `Tu efectivo cubre ${a.runway.days} días de operación al ritmo de gasto actual.`,
        'Refuerza el cobro de cartera y planifica los pagos grandes para extender tu runway.',
      ),
    );
  }

  // ─── CONFIGURAR ───────────────────────────────────────────────────
  if (!a.flags.hasCollectionPolicy) {
    out.push(
      alert(
        a,
        'info',
        'collection',
        'Sin política de cobro',
        a.collection.totalOverdue > 0
          ? `No tienes política de cobro configurada y ya tienes ${$(a.collection.totalOverdue)} en cartera vencida.`
          : 'No tienes una política de cobro configurada.',
        '¿Configuramos una política de cobro a 30 días con recordatorios automáticos?',
      ),
    );
  }
  if (!a.flags.hasPaymentPolicy) {
    out.push(
      alert(
        a,
        'info',
        'payment',
        'Sin política de pago',
        'No tienes una política de pago definida para tus proveedores.',
        '¿Definimos plazos estándar de pago para aprovechar descuentos por pronto pago?',
      ),
    );
  }
  if (!a.flags.hasBudget) {
    out.push(
      alert(
        a,
        'info',
        'budget',
        'Sin presupuesto del mes',
        'No hay presupuesto registrado para el mes en curso.',
        'Registra tu meta de ventas y presupuesto de gastos para activar las alertas de cumplimiento.',
      ),
    );
  }
  if (!a.flags.hasMinReserve) {
    out.push(
      alert(
        a,
        'info',
        'cash_position',
        'Sin reserva mínima',
        'No has definido una reserva mínima de caja.',
        'Define un colchón mínimo para que PosBank te avise antes de comprometerlo.',
      ),
    );
  }

  // ─── OPORTUNIDAD ──────────────────────────────────────────────────
  if (a.cashPosition.state === 'surplus') {
    out.push(
      alert(
        a,
        'opportunity',
        'cash_position',
        'Excedente disponible',
        `Tienes ${$(a.cashPosition.totalAvailable)} disponibles después de cubrir tus compromisos próximos.`,
        a.payment.earlyPaymentOpportunities > 0
          ? `Puedes adelantar pagos con descuento (ahorro potencial ${$(a.payment.earlyPaymentOpportunities)}) o reservar para el próximo mes.`
          : 'Puedes adelantar pagos a proveedores o reservar el excedente para el próximo mes.',
      ),
    );
  }

  if (a.payment.state === 'early_no_discount' && a.payment.earlyPaymentOpportunities > 0) {
    out.push(
      alert(
        a,
        'opportunity',
        'payment',
        'Descuento por pronto pago',
        `Hay proveedores que ofrecen descuento por pronto pago (ahorro potencial ${$(a.payment.earlyPaymentOpportunities)}).`,
        'Si tu caja lo permite, adelanta esos pagos y captura el descuento.',
      ),
    );
  }

  if (a.sales.state === 'exceeds') {
    out.push(
      alert(
        a,
        'opportunity',
        'sales',
        'Meta de ventas superada',
        `Vas en ${a.sales.percentage}% de la meta (${$(a.sales.actual)} de ${$(a.sales.budget)}). Buen cierre.`,
        'Considera reservar el excedente o reinvertir en lo que está impulsando las ventas.',
      ),
    );
  }

  if (a.costs.state === 'efficient' && a.flags.hasBudget) {
    out.push(
      alert(
        a,
        'opportunity',
        'costs',
        'Costos bajo presupuesto',
        `Tus costos van por debajo del presupuesto (${$(a.costs.actual)} vs ${$(a.costs.budget)}).`,
        'Buen control de gasto. Puedes destinar el ahorro a reserva o inversión.',
      ),
    );
  }

  return out;
}
