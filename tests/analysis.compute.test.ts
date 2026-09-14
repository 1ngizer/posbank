import { describe, it, expect } from 'vitest';
import {
  computeAnalysis,
  EngineInputs,
} from '../src/modules/analysis/analysis.compute';

/** Inputs base "sanos" que cada test ajusta según el escenario. */
function baseInputs(overrides: Partial<EngineInputs> = {}): EngineInputs {
  return {
    companyId: 'co-1',
    today: '2026-07-15',
    minReserve: 1_000_000,
    bankBalance: 20_000_000,
    physicalCash: 5_000_000,
    monthSalesIncome: 30_000_000,
    monthTotalExpense: 10_000_000,
    last90Expense: 30_000_000, // burn 10M/mes
    budget: {
      revenueBudget: 40_000_000,
      costBudget: 8_000_000,
      expenseBudget: 4_000_000,
      salesTarget: 40_000_000,
    },
    receivablesOpen: [],
    payablesOpen: [],
    commitments: [],
    hasCollectionPolicy: true,
    hasPaymentPolicy: true,
    ...overrides,
  };
}

describe('CashEngine · posición de caja', () => {
  it('marca déficit cuando el disponible no cubre los compromisos próximos', () => {
    const a = computeAnalysis(
      baseInputs({
        bankBalance: 1_000_000,
        physicalCash: 0,
        commitments: [
          { amount: 5_000_000, frequency: 'monthly', nextDueDate: '2026-07-20' },
        ],
      }),
    );
    expect(a.cashPosition.state).toBe('deficit');
  });

  it('marca excedente cuando sobra bastante tras cubrir compromisos y reserva', () => {
    const a = computeAnalysis(
      baseInputs({
        bankBalance: 60_000_000,
        physicalCash: 0,
        last90Expense: 3_000_000, // burn bajo → colchón grande
        commitments: [
          { amount: 2_000_000, frequency: 'monthly', nextDueDate: '2026-07-25' },
        ],
      }),
    );
    expect(a.cashPosition.state).toBe('surplus');
  });

  it('calcula posición neta = disponible + por cobrar - por pagar', () => {
    const a = computeAnalysis(
      baseInputs({
        bankBalance: 10_000_000,
        physicalCash: 0,
        receivablesOpen: [
          { amount: 4_000_000, dueDate: '2026-08-01', status: 'pending' },
        ],
        payablesOpen: [
          { amount: 3_000_000, dueDate: '2026-08-01', status: 'pending', earlyPaymentDiscountPct: 0 },
        ],
      }),
    );
    expect(a.cashPosition.netPosition).toBe(11_000_000);
  });
});

describe('CashEngine · ventas', () => {
  it('critical por debajo del 80% de la meta (76%)', () => {
    const a = computeAnalysis(
      baseInputs({ monthSalesIncome: 30_400_000, budget: { ...baseInputs().budget!, salesTarget: 40_000_000 } }),
    );
    expect(a.sales.percentage).toBeCloseTo(76, 0);
    expect(a.sales.state).toBe('critical');
  });

  it('at_risk en el rango 80-99% (85%)', () => {
    const a = computeAnalysis(
      baseInputs({ monthSalesIncome: 34_000_000, budget: { ...baseInputs().budget!, salesTarget: 40_000_000 } }),
    );
    expect(a.sales.percentage).toBeCloseTo(85, 0);
    expect(a.sales.state).toBe('at_risk');
  });

  it('exceeds por encima del 100%', () => {
    const a = computeAnalysis(baseInputs({ monthSalesIncome: 44_000_000 }));
    expect(a.sales.state).toBe('exceeds');
  });
});

describe('CashEngine · costos', () => {
  it('deviated cuando supera el presupuesto en más de 15%', () => {
    // budget costos = 12M; gasto 15M → +25%
    const a = computeAnalysis(baseInputs({ monthTotalExpense: 15_000_000 }));
    expect(a.costs.overBudgetPct).toBeGreaterThan(15);
    expect(a.costs.state).toBe('deviated');
  });

  it('efficient cuando está por debajo del presupuesto', () => {
    const a = computeAnalysis(baseInputs({ monthTotalExpense: 6_000_000 }));
    expect(a.costs.state).toBe('efficient');
  });
});

describe('CashEngine · runway', () => {
  it('emergency con menos de 30 días de cobertura', () => {
    const a = computeAnalysis(
      baseInputs({
        bankBalance: 3_000_000,
        physicalCash: 0,
        last90Expense: 30_000_000, // 10M/mes → ~9 días
      }),
    );
    expect(a.runway.state).toBe('emergency');
    expect(a.runway.days).toBeLessThan(30);
  });

  it('solid con más de 6 meses de cobertura', () => {
    const a = computeAnalysis(
      baseInputs({ bankBalance: 100_000_000, physicalCash: 0, last90Expense: 30_000_000 }),
    );
    expect(a.runway.state).toBe('solid');
  });
});

describe('CashEngine · política de cobro', () => {
  it('no_policy cuando la empresa no tiene política', () => {
    const a = computeAnalysis(baseInputs({ hasCollectionPolicy: false }));
    expect(a.collection.state).toBe('no_policy');
  });

  it('overdue con cartera vencida', () => {
    const a = computeAnalysis(
      baseInputs({
        receivablesOpen: [
          { amount: 5_000_000, dueDate: '2026-05-01', status: 'pending' },
        ],
      }),
    );
    expect(a.collection.state).toBe('overdue');
    expect(a.collection.overdueCount).toBe(1);
    expect(a.collection.totalOverdue).toBe(5_000_000);
    expect(a.collection.averageDaysOverdue).toBeGreaterThan(60);
  });
});
