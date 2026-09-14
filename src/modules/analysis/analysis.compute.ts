import { addDays, daysBetween } from '../../shared/dates';
import {
  CashAnalysis,
  CashPositionAnalysis,
  CollectionAnalysis,
  CostsAnalysis,
  PaymentAnalysis,
  RunwayAnalysis,
  SalesAnalysis,
} from '../../shared/types';

/**
 * Lógica de negocio PURA del CashEngine: recibe números ya agregados y produce
 * el CashAnalysis. Sin I/O → fácil de testear (ver tests/). Los umbrales viven
 * aquí, en un solo lugar.
 */

// Ventana para "compromisos próximos" al evaluar la posición de caja.
const UPCOMING_WINDOW_DAYS = 30;
const DAYS_PER_MONTH = 30;

export interface OpenReceivable {
  amount: number;
  dueDate: string; // YYYY-MM-DD
  status: string;
}
export interface OpenPayable {
  amount: number;
  dueDate: string;
  status: string;
  earlyPaymentDiscountPct: number;
}
export interface Commitment {
  amount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
  nextDueDate: string;
}
export interface BudgetInput {
  revenueBudget: number;
  costBudget: number;
  expenseBudget: number;
  salesTarget: number;
}

export interface EngineInputs {
  companyId: string;
  today: string; // YYYY-MM-DD (Bogotá)
  minReserve: number;
  bankBalance: number;
  physicalCash: number;
  monthSalesIncome: number; // ingresos categoría 'sales' del mes
  monthTotalExpense: number; // egresos del mes
  last90Expense: number; // egresos últimos 90 días (para burn)
  budget: BudgetInput | null;
  receivablesOpen: OpenReceivable[];
  payablesOpen: OpenPayable[];
  commitments: Commitment[];
  hasCollectionPolicy: boolean;
  hasPaymentPolicy: boolean;
}

/** Convierte un compromiso recurrente a su equivalente mensual. */
export function monthlyEquivalent(c: Commitment): number {
  switch (c.frequency) {
    case 'weekly':
      return c.amount * 4.333;
    case 'biweekly':
      return c.amount * 2.167;
    case 'monthly':
      return c.amount;
    case 'quarterly':
      return c.amount / 3;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Posición de caja ───────────────────────────────────────────────
export function computeCashPosition(i: EngineInputs): CashPositionAnalysis {
  const totalAvailable = round2(i.bankBalance + i.physicalCash);
  const totalReceivables = round2(
    i.receivablesOpen.reduce((s, r) => s + r.amount, 0),
  );
  const totalPayables = round2(i.payablesOpen.reduce((s, p) => s + p.amount, 0));
  const netPosition = round2(totalAvailable + totalReceivables - totalPayables);

  // Compromisos próximos = compromisos fijos + cuentas por pagar en ventana 30d.
  const horizon = addDays(i.today, UPCOMING_WINDOW_DAYS);
  const upcomingCommitments =
    i.commitments
      .filter((c) => c.nextDueDate <= horizon)
      .reduce((s, c) => s + c.amount, 0) +
    i.payablesOpen
      .filter((p) => p.status !== 'paid' && p.dueDate <= horizon)
      .reduce((s, p) => s + p.amount, 0);

  const covers = totalAvailable - upcomingCommitments; // lo que queda tras cubrir
  // Colchón mensual aproximado para distinguir "suficiente" de "excedente".
  const monthlyBurn = estimateMonthlyBurn(i);

  let state: CashPositionAnalysis['state'];
  if (totalAvailable < upcomingCommitments) {
    state = 'deficit';
  } else if (covers < i.minReserve) {
    state = 'tight';
  } else if (covers >= Math.max(i.minReserve, monthlyBurn)) {
    state = 'surplus';
  } else {
    state = 'sufficient';
  }

  return {
    totalAvailable,
    bankBalance: round2(i.bankBalance),
    physicalCash: round2(i.physicalCash),
    totalReceivables,
    totalPayables,
    netPosition,
    state,
  };
}

// ─── Cumplimiento de ventas ─────────────────────────────────────────
export function computeSales(i: EngineInputs): SalesAnalysis {
  const budget = i.budget ? i.budget.salesTarget || i.budget.revenueBudget : 0;
  const actual = round2(i.monthSalesIncome);
  const percentage = budget > 0 ? round2((actual / budget) * 100) : 0;

  let state: SalesAnalysis['state'];
  if (budget <= 0) {
    state = 'at_risk'; // sin meta no podemos evaluar; no disparamos "crítico"
  } else if (percentage > 100) {
    state = 'exceeds';
  } else if (percentage >= 100) {
    state = 'on_target';
  } else if (percentage >= 80) {
    state = 'at_risk';
  } else {
    state = 'critical';
  }

  return { actual, budget: round2(budget), percentage, state };
}

// ─── Costos y gastos ────────────────────────────────────────────────
export function computeCosts(i: EngineInputs): CostsAnalysis {
  const budget = i.budget ? i.budget.costBudget + i.budget.expenseBudget : 0;
  const actual = round2(i.monthTotalExpense);
  const percentage = budget > 0 ? round2((actual / budget) * 100) : 0;
  const overBudgetPct = budget > 0 ? Math.max(0, round2(percentage - 100)) : 0;

  let state: CostsAnalysis['state'];
  if (budget <= 0) {
    state = 'on_budget';
  } else if (percentage < 100) {
    state = 'efficient';
  } else if (overBudgetPct < 5) {
    state = 'on_budget';
  } else if (overBudgetPct <= 15) {
    state = 'review';
  } else {
    state = 'deviated';
  }

  return { actual, budget: round2(budget), percentage, overBudgetPct, state };
}

// ─── Política de cobro ──────────────────────────────────────────────
export function computeCollection(i: EngineInputs): CollectionAnalysis {
  const overdue = i.receivablesOpen.filter(
    (r) => r.status !== 'paid' && r.dueDate < i.today,
  );
  const totalOverdue = round2(overdue.reduce((s, r) => s + r.amount, 0));
  const overdueCount = overdue.length;
  const averageDaysOverdue =
    overdueCount > 0
      ? Math.round(
          overdue.reduce((s, r) => s + daysBetween(i.today, r.dueDate), 0) /
            overdueCount,
        )
      : 0;

  let state: CollectionAnalysis['state'];
  if (!i.hasCollectionPolicy) state = 'no_policy';
  else if (totalOverdue > 0) state = 'overdue';
  else state = 'healthy';

  return {
    hasPolicy: i.hasCollectionPolicy,
    totalOverdue,
    overdueCount,
    averageDaysOverdue,
    state,
  };
}

// ─── Política de pago ───────────────────────────────────────────────
export function computePayment(i: EngineInputs): PaymentAnalysis {
  const horizon = addDays(i.today, UPCOMING_WINDOW_DAYS);
  const upcoming = i.payablesOpen.filter(
    (p) => p.status !== 'paid' && p.dueDate <= horizon,
  );
  const upcomingPayments = round2(upcoming.reduce((s, p) => s + p.amount, 0));
  // Oportunidades: proveedores que ofrecen descuento por pronto pago.
  const earlyOps = i.payablesOpen.filter(
    (p) => p.status !== 'paid' && p.earlyPaymentDiscountPct > 0,
  );
  const earlyPaymentOpportunities = round2(
    earlyOps.reduce((s, p) => s + (p.amount * p.earlyPaymentDiscountPct) / 100, 0),
  );

  let state: PaymentAnalysis['state'];
  if (!i.hasPaymentPolicy) state = 'no_policy';
  else if (earlyOps.length > 0) state = 'early_no_discount';
  else state = 'on_time';

  return {
    hasPolicy: i.hasPaymentPolicy,
    upcomingPayments,
    earlyPaymentOpportunities,
    state,
  };
}

// ─── Runway (supervivencia) ─────────────────────────────────────────
export function estimateMonthlyBurn(i: EngineInputs): number {
  const fromMovements = i.last90Expense / 3;
  if (fromMovements > 0) return round2(fromMovements);
  // Fallback: compromisos fijos mensualizados.
  const fromCommitments = i.commitments.reduce(
    (s, c) => s + monthlyEquivalent(c),
    0,
  );
  return round2(fromCommitments);
}

export function computeRunway(i: EngineInputs): RunwayAnalysis {
  const availableCash = round2(i.bankBalance + i.physicalCash);
  const monthlyBurn = estimateMonthlyBurn(i);

  let days: number;
  if (monthlyBurn <= 0) {
    days = 9999; // sin gasto conocido → no hay riesgo de agotamiento
  } else {
    const dailyBurn = monthlyBurn / DAYS_PER_MONTH;
    days = Math.max(0, Math.round(availableCash / dailyBurn));
  }

  let state: RunwayAnalysis['state'];
  if (days >= 180) state = 'solid';
  else if (days >= 90) state = 'stable';
  else if (days >= 30) state = 'alert';
  else state = 'emergency';

  return { days, monthlyBurn, availableCash, state };
}

// ─── Orquestador ────────────────────────────────────────────────────
export function computeAnalysis(i: EngineInputs): CashAnalysis {
  return {
    companyId: i.companyId,
    computedAt: new Date().toISOString(),
    cashPosition: computeCashPosition(i),
    sales: computeSales(i),
    costs: computeCosts(i),
    collection: computeCollection(i),
    payment: computePayment(i),
    runway: computeRunway(i),
    flags: {
      hasBudget: !!i.budget,
      hasCollectionPolicy: i.hasCollectionPolicy,
      hasPaymentPolicy: i.hasPaymentPolicy,
      hasMinReserve: i.minReserve > 0,
    },
  };
}
