import { describe, it, expect } from 'vitest';
import { computeBreakEvenOverview, type ProductSalesInput } from '../src/modules/commercial/breakeven.overview';

// Escenario base calculado a mano (ventana de 30 días, costos fijos de 1.000.000):
//  A: precio 10.000, costo 6.000, 200 uds = 2.000.000 → aporta 4.000 por ud = 800.000
//  B: precio  5.000, costo 4.000, 400 uds = 2.000.000 → aporta 1.000 por ud = 400.000
//  Total ventas 4.000.000, contribución 1.200.000 (30 %) → equilibrio 3.333.333
const A: ProductSalesInput = { id: 'a', name: 'Producto A', listPrice: 10000, unitCost: 6000, unitsSold: 200, revenue: 2_000_000 };
const B: ProductSalesInput = { id: 'b', name: 'Producto B', listPrice: 5000, unitCost: 4000, unitsSold: 400, revenue: 2_000_000 };

const base = { fixedCostsMonthly: 1_000_000, products: [A, B], windowDays: 30, allocation: 'none' as const };

describe('punto de equilibrio general (empresa)', () => {
  it('calcula el margen ponderado y las ventas de equilibrio con la mezcla real', () => {
    const { company } = computeBreakEvenOverview(base);
    expect(company.revenuePerMonth).toBe(4_000_000);
    expect(company.contributionPerMonth).toBe(1_200_000);
    expect(company.weightedContributionRatioPct).toBe(30);
    expect(company.breakEvenRevenue).toBe(3_333_333);
    expect(company.coveragePct).toBe(120);
    expect(company.gapRevenue).toBe(0);
    expect(company.safetyMarginPct).toBe(16.7);
    expect(company.profitPerMonth).toBe(200_000);
    expect(company.viable).toBe(true);
  });

  it('dice en qué día del mes se cubren los costos fijos', () => {
    // 1.200.000 al mes = 40.000 por día → 1.000.000 se cubre el día 25
    expect(computeBreakEvenOverview(base).company.dayFixedCostsCovered).toBe(25);
  });

  it('lleva ventas de una ventana de 60 días a un mes y detecta que no se alcanza el equilibrio', () => {
    const { company } = computeBreakEvenOverview({ ...base, windowDays: 60 });
    expect(company.revenuePerMonth).toBe(2_000_000);
    expect(company.contributionPerMonth).toBe(600_000);
    expect(company.coveragePct).toBe(60);
    expect(company.gapRevenue).toBe(1_333_333);
    expect(company.profitPerMonth).toBe(-400_000);
    expect(company.dayFixedCostsCovered).toBeNull(); // 600.000/30 = 20.000 por día → día 50: no cabe en el mes
    expect(company.message).toMatch(/no alcanzas a cubrir/);
  });

  it('no es viable si cada venta resta dinero', () => {
    const loser: ProductSalesInput = { id: 'x', name: 'X', listPrice: 10000, unitCost: 12000, unitsSold: 10, revenue: 100_000 };
    const { company } = computeBreakEvenOverview({ ...base, products: [loser] });
    expect(company.viable).toBe(false);
    expect(company.breakEvenRevenue).toBeNull();
    expect(company.message).toMatch(/resta dinero/);
  });

  it('avisa cuando no hay costos fijos o no hay ventas', () => {
    expect(computeBreakEvenOverview({ ...base, fixedCostsMonthly: 0 }).company.message).toMatch(/costos fijos registrados/);
    expect(computeBreakEvenOverview({ ...base, products: [] }).company.message).toMatch(/No hay ventas/);
  });

  it('compara lo ganado en el mes en curso con lo esperado a esa fecha', () => {
    const behind = computeBreakEvenOverview({
      ...base,
      monthToDate: { contribution: 300_000, dayOfMonth: 10, daysInMonth: 30 },
    }).company.monthToDate;
    expect(behind).toEqual({ coveredPct: 30, dayOfMonth: 10, onTrack: false }); // esperado: 33,3 %

    const ahead = computeBreakEvenOverview({
      ...base,
      monthToDate: { contribution: 400_000, dayOfMonth: 10, daysInMonth: 30 },
    }).company.monthToDate;
    expect(ahead?.onTrack).toBe(true);
  });
});

describe('punto de equilibrio por producto', () => {
  it('calcula las unidades de equilibrio de cada producto si fuera el único', () => {
    const { products } = computeBreakEvenOverview(base);
    const a = products.find((p) => p.id === 'a')!;
    const b = products.find((p) => p.id === 'b')!;
    expect(a.contributionPerUnit).toBe(4000);
    expect(a.contributionRatioPct).toBe(40);
    expect(a.breakEvenUnitsAlone).toBe(250); // 1.000.000 / 4.000
    expect(b.contributionPerUnit).toBe(1000);
    expect(b.breakEvenUnitsAlone).toBe(1000); // 1.000.000 / 1.000
  });

  it('ordena por lo que más aporta y calcula la participación en ventas', () => {
    const { products } = computeBreakEvenOverview(base);
    expect(products.map((p) => p.id)).toEqual(['a', 'b']);
    expect(products[0].shareOfSalesPct).toBe(50);
    expect(products[0].contributionPerMonth).toBe(800_000);
  });

  it('reparte los costos fijos por ventas (estimación)', () => {
    const { products, notes } = computeBreakEvenOverview({ ...base, allocation: 'sales' });
    const a = products.find((p) => p.id === 'a')!;
    const b = products.find((p) => p.id === 'b')!;
    expect(a.allocatedFixedCosts).toBe(500_000);
    expect(a.breakEvenUnitsShare).toBe(125); // 500.000 / 4.000, vende 200 → cubre
    expect(a.status).toBe('covers');
    expect(b.breakEvenUnitsShare).toBe(500); // 500.000 / 1.000, vende 400 → no alcanza
    expect(b.status).toBe('below');
    expect(notes.join(' ')).toMatch(/estimación/);
  });

  it('reparte los costos fijos por margen de contribución', () => {
    const { products } = computeBreakEvenOverview({ ...base, allocation: 'margin' });
    const a = products.find((p) => p.id === 'a')!;
    const b = products.find((p) => p.id === 'b')!;
    expect(a.allocatedFixedCosts).toBe(666_667); // 800.000 de 1.200.000 = 2/3
    expect(b.allocatedFixedCosts).toBe(333_333);
    expect(b.breakEvenUnitsShare).toBe(334);
    expect(b.status).toBe('covers'); // vende 400 ≥ 334
  });

  it('marca los productos con margen negativo', () => {
    const loser: ProductSalesInput = { id: 'x', name: 'X', listPrice: 10000, unitCost: 12000, unitsSold: 10, revenue: 100_000 };
    const x = computeBreakEvenOverview({ ...base, products: [A, loser] }).products.find((p) => p.id === 'x')!;
    expect(x.status).toBe('negative_margin');
    expect(x.breakEvenUnitsAlone).toBeNull();
    expect(x.warning).toMatch(/por debajo de su costo/);
  });

  it('avisa de los productos sin costo registrado, porque inflan el margen', () => {
    const noCost: ProductSalesInput = { id: 'n', name: 'N', listPrice: 8000, unitCost: 0, unitsSold: 10, revenue: 80_000 };
    const out = computeBreakEvenOverview({ ...base, products: [A, noCost] });
    expect(out.products.find((p) => p.id === 'n')!.status).toBe('no_cost');
    expect(out.notes.join(' ')).toMatch(/sin costo registrado/);
  });

  it('un producto sin ventas usa su precio de lista para el equilibrio y no suma al total', () => {
    const idle: ProductSalesInput = { id: 'i', name: 'I', listPrice: 9000, unitCost: 5000, unitsSold: 0, revenue: 0 };
    const out = computeBreakEvenOverview({ ...base, products: [A, B, idle] });
    const i = out.products.find((p) => p.id === 'i')!;
    expect(i.status).toBe('no_sales');
    expect(i.breakEvenUnitsAlone).toBe(250); // 1.000.000 / (9.000 - 5.000)
    expect(out.company.revenuePerMonth).toBe(4_000_000);
  });

  it('usa el precio real facturado (con descuentos) y no el de lista', () => {
    // Lista 10.000 pero se facturó a 8.000 promedio: aporta 2.000 por unidad, no 4.000
    const discounted: ProductSalesInput = { ...A, revenue: 1_600_000 };
    const a = computeBreakEvenOverview({ ...base, products: [discounted] }).products[0];
    expect(a.contributionPerUnit).toBe(2000);
    expect(a.breakEvenUnitsAlone).toBe(500);
  });
});
