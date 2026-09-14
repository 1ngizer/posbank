import { adminClient } from '../../config/supabase';
import { runCashEngine } from '../analysis/cash-engine';

export interface CompanySummary {
  id: string;
  name: string;
  nit: string | null;
  industry: string | null;
  size: number | null;
  cashPosition: { state: string; totalAvailable: number };
  runway: { days: number; state: string };
  sales: { percentage: number; state: string; hasBudget: boolean };
  collection: { totalOverdue: number; state: string };
  alerts: { critical: number; warning: number; unread: number };
  lastActivityAt: string | null;
  createdAt: string;
}

/** Arma el resumen de indicadores de UNA empresa (corre el motor + conteos). */
export async function buildCompanySummary(company: {
  id: string; name: string; nit: string | null; industry: string | null;
  size: number | null; created_at: string;
}): Promise<CompanySummary> {
  const [analysis, alertsRes, lastMov] = await Promise.all([
    runCashEngine(company.id, adminClient),
    adminClient
      .from('alerts')
      .select('severity, status')
      .eq('company_id', company.id)
      .gte('created_at', new Date(Date.now() - 30 * 864e5).toISOString()),
    adminClient
      .from('cash_movements')
      .select('created_at')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const alerts = alertsRes.data ?? [];
  const critical = alerts.filter((a) => a.severity === 'critical').length;
  const warning = alerts.filter((a) => a.severity === 'warning').length;
  const unread = alerts.filter((a) => a.status === 'sent').length;

  return {
    id: company.id,
    name: company.name,
    nit: company.nit,
    industry: company.industry,
    size: company.size,
    cashPosition: {
      state: analysis.cashPosition.state,
      totalAvailable: analysis.cashPosition.totalAvailable,
    },
    runway: { days: analysis.runway.days, state: analysis.runway.state },
    sales: {
      percentage: analysis.sales.percentage,
      state: analysis.sales.state,
      hasBudget: analysis.flags.hasBudget,
    },
    collection: {
      totalOverdue: analysis.collection.totalOverdue,
      state: analysis.collection.state,
    },
    alerts: { critical, warning, unread },
    lastActivityAt: lastMov.data?.created_at ?? null,
    createdAt: company.created_at,
  };
}

/** Resumen de TODOS los clientes (para la lista del panel admin). */
export async function listCompanySummaries(): Promise<CompanySummary[]> {
  const { data, error } = await adminClient
    .from('companies')
    .select('id, name, nit, industry, size, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return Promise.all((data ?? []).map(buildCompanySummary));
}

export interface TrendPoint {
  weekStart: string; // YYYY-MM-DD (lunes)
  income: number;
  expense: number;
  net: number;
}

/** Lunes de la semana de una fecha YYYY-MM-DD. */
function mondayOf(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // 0 = lunes
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

/**
 * Evolución semanal de flujo de caja (ingresos/egresos/neto) de UNA empresa o
 * de TODAS (companyId = null). Devuelve `weeks` cubos continuos hasta hoy.
 */
export async function computeTrend(
  companyId: string | null,
  weeks = 12,
): Promise<TrendPoint[]> {
  const today = new Date();
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - weeks * 7);
  const startISO = start.toISOString().slice(0, 10);

  let q = adminClient
    .from('cash_movements')
    .select('date, type, amount, company_id')
    .gte('date', startISO);
  if (companyId) q = q.eq('company_id', companyId);
  const { data } = await q;

  // Cubos continuos (últimas `weeks` semanas empezando en lunes).
  const buckets = new Map<string, TrendPoint>();
  const firstMonday = mondayOf(startISO);
  for (let i = 0; i <= weeks; i++) {
    const dt = new Date(`${firstMonday}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + i * 7);
    const key = dt.toISOString().slice(0, 10);
    buckets.set(key, { weekStart: key, income: 0, expense: 0, net: 0 });
  }

  for (const m of data ?? []) {
    const key = mondayOf(m.date);
    const b = buckets.get(key);
    if (!b) continue;
    const amt = Number(m.amount);
    if (m.type === 'income') b.income += amt;
    else b.expense += amt;
    b.net = b.income - b.expense;
  }

  return [...buckets.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

/** Totales de plataforma para las tarjetas de arriba. */
export function computeOverview(summaries: CompanySummary[]) {
  const totalCash = summaries.reduce((s, c) => s + c.cashPosition.totalAvailable, 0);
  const totalOverdue = summaries.reduce((s, c) => s + c.collection.totalOverdue, 0);
  const atRisk = summaries.filter(
    (c) => c.cashPosition.state === 'deficit' || c.runway.state === 'emergency',
  ).length;
  const criticalAlerts = summaries.reduce((s, c) => s + c.alerts.critical, 0);
  return {
    companies: summaries.length,
    totalCash,
    totalOverdue,
    atRisk,
    criticalAlerts,
  };
}
