import { SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from '../../config/supabase';
import { CashAnalysis } from '../../shared/types';
import { monthRange, todayBogota, addDays } from '../../shared/dates';
import { computeAnalysis, EngineInputs } from './analysis.compute';

/**
 * CashEngine — reúne los datos financieros de una empresa desde Supabase y
 * produce el CashAnalysis. Corre en cada movimiento y cada hora (cron).
 *
 * Por defecto usa adminClient (para cron/webhooks sin JWT), pero acepta un
 * cliente RLS para llamadas desde endpoints autenticados.
 */
export async function runCashEngine(
  companyId: string,
  db: SupabaseClient = adminClient,
): Promise<CashAnalysis> {
  const today = todayBogota();
  const { start: monthStart, end: monthEnd } = monthRange(today);
  const burnStart = addDays(today, -90);

  const [
    companyRes,
    bankRes,
    monthMovementsRes,
    burnExpenseRes,
    receivablesRes,
    payablesRes,
    budgetRes,
    collectionRes,
    paymentRes,
    commitmentsRes,
    physicalCashRes,
  ] = await Promise.all([
    db.from('companies').select('settings').eq('id', companyId).single(),
    db.from('bank_accounts').select('current_balance').eq('company_id', companyId),
    db
      .from('cash_movements')
      .select('type, amount, category')
      .eq('company_id', companyId)
      .gte('date', monthStart)
      .lte('date', monthEnd),
    db
      .from('cash_movements')
      .select('amount')
      .eq('company_id', companyId)
      .eq('type', 'expense')
      .gte('date', burnStart)
      .lte('date', today),
    db
      .from('receivables')
      .select('amount, due_date, status')
      .eq('company_id', companyId)
      .neq('status', 'paid'),
    db
      .from('payables')
      .select('amount, due_date, status, early_payment_discount_pct')
      .eq('company_id', companyId)
      .neq('status', 'paid'),
    db
      .from('budgets')
      .select('revenue_budget, cost_budget, expense_budget, sales_target')
      .eq('company_id', companyId)
      .eq('year', Number(today.slice(0, 4)))
      .eq('month', Number(today.slice(5, 7)))
      .maybeSingle(),
    db
      .from('collection_policies')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .maybeSingle(),
    db
      .from('payment_policies')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .maybeSingle(),
    db
      .from('fixed_commitments')
      .select('amount, frequency, next_due_date')
      .eq('company_id', companyId)
      .eq('is_active', true),
    // Antes corría como un await separado DESPUÉS de este Promise.all, lo que
    // añadía un viaje de red completo en serie a cada llamada del motor.
    db.from('cash_movements').select('type, amount').eq('company_id', companyId),
  ]);

  const settings = (companyRes.data?.settings ?? {}) as {
    minimum_cash_reserve?: number;
  };

  const bankBalance = (bankRes.data ?? []).reduce(
    (s, b) => s + Number(b.current_balance),
    0,
  );

  // Efectivo en caja física ≈ neto acumulado de movimientos registrados.
  // (MVP: los movimientos de caja los registra el bot/POS; refinable luego.)
  let monthSalesIncome = 0;
  let monthTotalExpense = 0;
  const monthMovements = monthMovementsRes.data ?? [];
  for (const m of monthMovements) {
    if (m.type === 'income' && m.category === 'sales') monthSalesIncome += Number(m.amount);
    if (m.type === 'expense') monthTotalExpense += Number(m.amount);
  }

  const physicalCash = sumPhysicalCash(physicalCashRes.data ?? []);
  const last90Expense = (burnExpenseRes.data ?? []).reduce(
    (s, m) => s + Number(m.amount),
    0,
  );

  const budget = budgetRes.data
    ? {
        revenueBudget: Number(budgetRes.data.revenue_budget),
        costBudget: Number(budgetRes.data.cost_budget),
        expenseBudget: Number(budgetRes.data.expense_budget),
        salesTarget: Number(budgetRes.data.sales_target),
      }
    : null;

  const inputs: EngineInputs = {
    companyId,
    today,
    minReserve: Number(settings.minimum_cash_reserve ?? 0),
    bankBalance,
    physicalCash,
    monthSalesIncome,
    monthTotalExpense,
    last90Expense,
    budget,
    receivablesOpen: (receivablesRes.data ?? []).map((r) => ({
      amount: Number(r.amount),
      dueDate: r.due_date,
      status: r.status,
    })),
    payablesOpen: (payablesRes.data ?? []).map((p) => ({
      amount: Number(p.amount),
      dueDate: p.due_date,
      status: p.status,
      earlyPaymentDiscountPct: Number(p.early_payment_discount_pct),
    })),
    commitments: (commitmentsRes.data ?? []).map((c) => ({
      amount: Number(c.amount),
      frequency: c.frequency,
      nextDueDate: c.next_due_date,
    })),
    hasCollectionPolicy: !!collectionRes.data,
    hasPaymentPolicy: !!paymentRes.data,
  };

  return computeAnalysis(inputs);
}

/**
 * Efectivo en caja física acumulado = Σ ingresos − Σ egresos de todos los
 * movimientos históricos registrados por la empresa.
 */
function sumPhysicalCash(rows: Array<{ type: string; amount: number | string }>): number {
  let cash = 0;
  for (const m of rows) {
    cash += m.type === 'income' ? Number(m.amount) : -Number(m.amount);
  }
  return cash;
}
