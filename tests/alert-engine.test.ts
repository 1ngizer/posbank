import { describe, it, expect } from 'vitest';
import { generateAlerts } from '../src/modules/alerts/alert-engine';
import { CashAnalysis } from '../src/shared/types';

function analysis(overrides: Partial<CashAnalysis> = {}): CashAnalysis {
  const base: CashAnalysis = {
    companyId: 'co-1',
    computedAt: new Date().toISOString(),
    cashPosition: {
      totalAvailable: 25_000_000,
      bankBalance: 20_000_000,
      physicalCash: 5_000_000,
      totalReceivables: 0,
      totalPayables: 0,
      netPosition: 25_000_000,
      state: 'sufficient',
    },
    sales: { actual: 40_000_000, budget: 40_000_000, percentage: 100, state: 'on_target' },
    costs: { actual: 8_000_000, budget: 12_000_000, percentage: 66, overBudgetPct: 0, state: 'efficient' },
    collection: { hasPolicy: true, totalOverdue: 0, overdueCount: 0, averageDaysOverdue: 0, state: 'healthy' },
    payment: { hasPolicy: true, upcomingPayments: 0, earlyPaymentOpportunities: 0, state: 'on_time' },
    runway: { days: 200, monthlyBurn: 10_000_000, availableCash: 25_000_000, state: 'solid' },
    flags: { hasBudget: true, hasCollectionPolicy: true, hasPaymentPolicy: true, hasMinReserve: true },
    ...overrides,
  };
  return base;
}

describe('AlertEngine', () => {
  it('genera una alerta crítica cuando el runway está en emergencia', () => {
    const alerts = generateAlerts(
      analysis({
        runway: { days: 22, monthlyBurn: 10_000_000, availableCash: 7_000_000, state: 'emergency' },
      }),
    );
    const critical = alerts.find((a) => a.category === 'runway' && a.severity === 'critical');
    expect(critical).toBeDefined();
    expect(critical!.suggestedAction).toBeTruthy();
  });

  it('sugiere configurar presupuesto cuando no hay budget', () => {
    const alerts = generateAlerts(
      analysis({ flags: { hasBudget: false, hasCollectionPolicy: true, hasPaymentPolicy: true, hasMinReserve: true } }),
    );
    expect(alerts.some((a) => a.category === 'budget' && a.severity === 'info')).toBe(true);
  });

  it('genera oportunidad ante excedente de caja', () => {
    const alerts = generateAlerts(
      analysis({
        cashPosition: { ...analysis().cashPosition, state: 'surplus' },
      }),
    );
    expect(alerts.some((a) => a.severity === 'opportunity' && a.category === 'cash_position')).toBe(true);
  });

  it('cada alerta trae una dedupeKey estable', () => {
    const alerts = generateAlerts(analysis({ flags: { hasBudget: false, hasCollectionPolicy: false, hasPaymentPolicy: false, hasMinReserve: false } }));
    for (const a of alerts) {
      expect(a.dedupeKey).toMatch(/^[a-z_]+:[a-z]+$/);
    }
  });

  it('genera warning de ventas también cuando están en estado critical (<80%)', () => {
    const alerts = generateAlerts(
      analysis({
        sales: { actual: 20_000_000, budget: 40_000_000, percentage: 50, state: 'critical' },
      }),
    );
    expect(alerts.some((a) => a.category === 'sales' && a.severity === 'warning')).toBe(true);
  });

  it('escenario sano no dispara críticas', () => {
    const alerts = generateAlerts(analysis());
    expect(alerts.some((a) => a.severity === 'critical')).toBe(false);
  });
});
