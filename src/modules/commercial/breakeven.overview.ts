/**
 * Punto de equilibrio general de la empresa y por producto.
 *
 * Lógica pura (sin base de datos) para poder probarla. El servicio le entrega los
 * productos con lo que realmente se vendió en una ventana de días y los costos
 * fijos mensuales (fixed_commitments). Todo se lleva a un "mes de 30 días".
 *
 * Idea central: el punto de equilibrio de la EMPRESA se calcula con la mezcla real de
 * ventas (margen de contribución ponderado), porque casi nunca se vende un solo producto.
 * El de cada PRODUCTO responde otra pregunta: "si solo vendiera este, cuánto tendría
 * que vender para cubrir los costos fijos (o la parte que le toca)".
 */

export type FixedCostAllocation = 'none' | 'sales' | 'margin';

export interface ProductSalesInput {
  id: string;
  name: string;
  listPrice: number; // precio de lista (sin IVA)
  unitCost: number; // costo unitario registrado
  unitsSold: number; // unidades facturadas en la ventana
  revenue: number; // ventas reales en la ventana, sin IVA (incluye descuentos)
}

export interface BreakEvenOverviewInput {
  fixedCostsMonthly: number;
  products: ProductSalesInput[];
  windowDays: number; // días que cubre unitsSold/revenue
  allocation: FixedCostAllocation;
  /** Contribución real del mes en curso hasta hoy y día del mes (1 a 31), opcional. */
  monthToDate?: { contribution: number; dayOfMonth: number; daysInMonth: number };
}

export type ProductStatus = 'covers' | 'below' | 'no_sales' | 'negative_margin' | 'no_cost';

export interface ProductBreakEven {
  id: string;
  name: string;
  listPrice: number;
  unitCost: number;
  contributionPerUnit: number;
  contributionRatioPct: number;
  unitsPerMonth: number;
  revenuePerMonth: number;
  contributionPerMonth: number;
  shareOfSalesPct: number;
  allocatedFixedCosts: number;
  /** Unidades al mes para cubrir TODOS los costos fijos si fuera el único producto. */
  breakEvenUnitsAlone: number | null;
  /** Unidades al mes para cubrir solo la parte de costos fijos que le toca. */
  breakEvenUnitsShare: number | null;
  coversItsShare: boolean;
  status: ProductStatus;
  warning?: string;
}

export interface CompanyBreakEven {
  fixedCostsMonthly: number;
  revenuePerMonth: number;
  contributionPerMonth: number;
  weightedContributionRatioPct: number;
  breakEvenRevenue: number | null;
  coveragePct: number | null; // ventas actuales / ventas de equilibrio
  gapRevenue: number | null; // lo que falta vender (0 si ya se cubre)
  safetyMarginPct: number | null;
  profitPerMonth: number; // contribución - costos fijos
  viable: boolean;
  /** Día del mes (1 a 30) en que, al ritmo promedio, se cubren los costos fijos; null si no se cubren. */
  dayFixedCostsCovered: number | null;
  monthToDate?: { coveredPct: number; dayOfMonth: number; onTrack: boolean };
  message: string;
}

export interface BreakEvenOverview {
  windowDays: number;
  allocation: FixedCostAllocation;
  company: CompanyBreakEven;
  products: ProductBreakEven[];
  notes: string[];
}

const MONTH_DAYS = 30;

const round = (n: number, d = 0) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

export function computeBreakEvenOverview(input: BreakEvenOverviewInput): BreakEvenOverview {
  const { fixedCostsMonthly, allocation } = input;
  const windowDays = Math.max(1, input.windowDays);
  const scale = MONTH_DAYS / windowDays;
  const notes: string[] = [];

  // 1) Lo vendido por producto, llevado a un mes.
  const base = input.products.map((p) => {
    const sold = p.unitsSold > 0;
    const avgPrice = sold ? p.revenue / p.unitsSold : p.listPrice;
    const contributionPerUnit = avgPrice - p.unitCost;
    const unitsPerMonth = p.unitsSold * scale;
    const revenuePerMonth = p.revenue * scale;
    const contributionPerMonth = sold ? (p.revenue - p.unitCost * p.unitsSold) * scale : 0;
    return { p, sold, avgPrice, contributionPerUnit, unitsPerMonth, revenuePerMonth, contributionPerMonth };
  });

  const totalRevenue = base.reduce((a, b) => a + b.revenuePerMonth, 0);
  const totalContribution = base.reduce((a, b) => a + b.contributionPerMonth, 0);
  const positiveContribution = base.reduce((a, b) => a + Math.max(0, b.contributionPerMonth), 0);

  // 2) Cada producto.
  const products: ProductBreakEven[] = base.map((b) => {
    const { p } = b;
    let allocated = 0;
    if (allocation === 'sales' && totalRevenue > 0) allocated = fixedCostsMonthly * (b.revenuePerMonth / totalRevenue);
    if (allocation === 'margin' && positiveContribution > 0) {
      allocated = fixedCostsMonthly * (Math.max(0, b.contributionPerMonth) / positiveContribution);
    }

    const cpu = b.contributionPerUnit;
    const canCover = cpu > 0;
    const alone = canCover ? Math.ceil(fixedCostsMonthly / cpu) : null;
    const share = canCover ? Math.ceil(allocated / cpu) : null;

    let status: ProductStatus;
    let warning: string | undefined;
    if (p.unitCost <= 0) {
      status = 'no_cost';
      warning = 'Sin costo registrado: el margen se ve mejor de lo real. Registra su costo en Inventario.';
    } else if (cpu <= 0) {
      status = 'negative_margin';
      warning = 'Se vende por debajo de su costo: cada unidad resta dinero.';
    } else if (!b.sold) {
      status = 'no_sales';
      warning = 'No se vendió en este período.';
    } else if (allocation !== 'none' && b.unitsPerMonth < (share ?? 0)) {
      status = 'below';
    } else {
      status = 'covers';
    }

    return {
      id: p.id,
      name: p.name,
      listPrice: round(p.listPrice),
      unitCost: round(p.unitCost),
      contributionPerUnit: round(cpu),
      contributionRatioPct: b.avgPrice > 0 ? round((cpu / b.avgPrice) * 100, 1) : 0,
      unitsPerMonth: round(b.unitsPerMonth, 1),
      revenuePerMonth: round(b.revenuePerMonth),
      contributionPerMonth: round(b.contributionPerMonth),
      shareOfSalesPct: totalRevenue > 0 ? round((b.revenuePerMonth / totalRevenue) * 100, 1) : 0,
      allocatedFixedCosts: round(allocated),
      breakEvenUnitsAlone: alone,
      breakEvenUnitsShare: allocation === 'none' ? null : share,
      coversItsShare: status === 'covers',
      status,
      warning,
    };
  });

  // Los que más aportan primero; los que no se venden, al final.
  products.sort((a, b) => b.contributionPerMonth - a.contributionPerMonth);

  // 3) La empresa completa.
  const ratio = totalRevenue > 0 ? totalContribution / totalRevenue : 0;
  const viable = ratio > 0;
  const breakEvenRevenue = viable ? fixedCostsMonthly / ratio : null;
  const coveragePct = breakEvenRevenue && breakEvenRevenue > 0 ? (totalRevenue / breakEvenRevenue) * 100 : null;
  const gapRevenue = breakEvenRevenue !== null ? Math.max(0, breakEvenRevenue - totalRevenue) : null;
  const safetyMarginPct =
    breakEvenRevenue !== null && totalRevenue > 0 ? ((totalRevenue - breakEvenRevenue) / totalRevenue) * 100 : null;
  const profit = totalContribution - fixedCostsMonthly;

  let dayCovered: number | null = null;
  if (totalContribution > 0) {
    const day = Math.ceil(fixedCostsMonthly / (totalContribution / MONTH_DAYS));
    dayCovered = day <= MONTH_DAYS ? Math.max(1, day) : null;
  }

  let monthToDate: CompanyBreakEven['monthToDate'];
  if (input.monthToDate && fixedCostsMonthly > 0) {
    const { contribution, dayOfMonth, daysInMonth } = input.monthToDate;
    const coveredPct = (contribution / fixedCostsMonthly) * 100;
    const expectedPct = (dayOfMonth / Math.max(1, daysInMonth)) * 100;
    monthToDate = { coveredPct: round(coveredPct, 1), dayOfMonth, onTrack: coveredPct >= expectedPct };
  }

  let message: string;
  if (fixedCostsMonthly <= 0) {
    message = 'No hay costos fijos registrados: registra arriendo, nómina y servicios en Compromisos para calcular el equilibrio.';
  } else if (totalRevenue <= 0) {
    message = 'No hay ventas facturadas en este período: no se puede calcular el equilibrio con la mezcla real.';
  } else if (!viable) {
    message = 'Con la mezcla actual cada venta resta dinero: el margen de contribución es cero o negativo. Revisa precios y costos.';
  } else if (profit >= 0) {
    message = dayCovered
      ? `Al ritmo actual cubres los costos fijos hacia el día ${dayCovered} del mes y quedas con ganancia.`
      : 'Cubres los costos fijos y quedas con ganancia.';
  } else {
    message = `Al ritmo actual no alcanzas a cubrir los costos fijos: te faltan ${Math.round(gapRevenue ?? 0).toLocaleString('es-CO')} COP en ventas al mes.`;
  }

  if (allocation !== 'none') {
    notes.push('El reparto de costos fijos por producto es una estimación: sirve para decidir, no es contabilidad.');
  }
  if (products.some((p) => p.status === 'no_cost')) {
    notes.push('Hay productos sin costo registrado; el equilibrio real es más alto de lo que se muestra.');
  }

  return {
    windowDays,
    allocation,
    company: {
      fixedCostsMonthly: round(fixedCostsMonthly),
      revenuePerMonth: round(totalRevenue),
      contributionPerMonth: round(totalContribution),
      weightedContributionRatioPct: round(ratio * 100, 1),
      breakEvenRevenue: breakEvenRevenue !== null ? round(breakEvenRevenue) : null,
      coveragePct: coveragePct !== null ? round(coveragePct, 1) : null,
      gapRevenue: gapRevenue !== null ? round(gapRevenue) : null,
      safetyMarginPct: safetyMarginPct !== null ? round(safetyMarginPct, 1) : null,
      profitPerMonth: round(profit),
      viable,
      dayFixedCostsCovered: dayCovered,
      monthToDate,
      message,
    },
    products,
    notes,
  };
}
