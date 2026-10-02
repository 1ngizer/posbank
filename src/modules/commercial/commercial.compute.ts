/**
 * PosBank · Motor de Cálculo Comercial & Pricing
 * Fórmulas financieras para economías de escala, punto de equilibrio,
 * unit economics (CAC, CRC, LTV) y prueba ácida de crecimiento.
 */

export interface BulkDiscountRule {
  minVolume: number;
  discountPct: number; // e.g. 10 para 10%
}

export interface PricingTierInput {
  minQty: number;
  maxQty?: number | null;
  volumeDiscountPct?: number; // descuento concedido al cliente
}

export interface PricingTierResult {
  minQty: number;
  maxQty?: number | null;
  unitCost: number;
  unitPrice: number;
  profitPerUnit: number;
  marginPct: number;
  totalRevenueAtMin: number;
  totalProfitAtMin: number;
  isViable: boolean;
}

export interface BreakEvenInput {
  fixedCostsMonthly: number;
  unitPrice: number;
  unitVariableCost: number;
  projectedSalesUnits?: number;
}

export interface BreakEvenResult {
  fixedCostsMonthly: number;
  unitPrice: number;
  unitVariableCost: number;
  contributionMarginPerUnit: number;
  contributionMarginRatio: number;
  breakEvenUnits: number;
  breakEvenRevenue: number;
  safetyMarginUnits?: number;
  safetyMarginPct?: number;
  isCoveringFixedCosts: boolean;
}

export interface UnitEconomicsInput {
  acquisitionSpend: number; // pauta, comisiones, comerciales en el período
  newCustomers: number;
  retentionSpend?: number; // fidelización, posventa, descuentos
  activeCustomers?: number;
  avgTicket: number;
  annualPurchaseFrequency: number;
  customerLifespanYears: number;
  grossMarginPct: number; // e.g. 35 para 35%
}

export type HealthStatus = 'critical' | 'warning' | 'healthy' | 'underinvested';

export interface UnitEconomicsResult {
  cac: number;
  crc: number;
  ltv: number;
  ltvCacRatio: number;
  cacPaybackMonths: number;
  annualRevenuePerCustomer: number;
  monthlyGrossProfitPerCustomer: number;
  status: HealthStatus;
  statusMessage: string;
}

export interface GrowthAcidTestInput {
  targetNewCustomers: number;
  estimatedCac: number;
  availableCash: number;
  currentRunwayDays: number;
  daysToCollectReceivables?: number; // días de cartera
  cacPaybackMonths: number;
}

export interface GrowthAcidTestResult {
  totalAcquisitionInvestment: number;
  cashDrainPct: number;
  isViable: boolean;
  riskLevel: 'bajo' | 'medio' | 'alto' | 'critico';
  estimatedPostInvestmentCash: number;
  projectedRunwayDays: number;
  diagnostico: string;
  recomendaciones: string[];
}

function round2(num: number): number {
  return Math.round(num * 100) / 100;
}

/**
 * 1. Calcula el costo unitario de materia prima según escala de compra.
 */
export function calculateRawMaterialCost(
  baseCostPerUnit: number,
  orderVolume: number,
  rules: BulkDiscountRule[] = [],
): { effectiveCost: number; discountPct: number; totalSavings: number } {
  if (orderVolume <= 0 || baseCostPerUnit <= 0) {
    return { effectiveCost: baseCostPerUnit, discountPct: 0, totalSavings: 0 };
  }

  // Ordenar reglas de mayor a menor volumen
  const sorted = [...rules].sort((a, b) => b.minVolume - a.minVolume);
  const matched = sorted.find((r) => orderVolume >= r.minVolume);
  const discountPct = matched ? matched.discountPct : 0;
  const effectiveCost = round2(baseCostPerUnit * (1 - discountPct / 100));
  const totalSavings = round2((baseCostPerUnit - effectiveCost) * orderVolume);

  return { effectiveCost, discountPct, totalSavings };
}

/**
 * 2. Genera escalas de precios por volumen (Tiered Pricing) para propuestas comerciales.
 */
export function calculatePricingProposal(
  baseCost: number,
  targetMarginPct: number,
  tiers: PricingTierInput[],
  materialDiscountRules: BulkDiscountRule[] = [],
): PricingTierResult[] {
  if (baseCost <= 0) return [];

  // Precio base de lista sin descuento
  // margen = (precio - costo) / precio => precio = costo / (1 - margen)
  const marginDecimal = Math.min(Math.max(targetMarginPct, 1), 99) / 100;
  const baseListPrice = round2(baseCost / (1 - marginDecimal));

  return tiers.map((tier) => {
    // Si la escala de compra del volumen permite ahorro de costo
    const { effectiveCost } = calculateRawMaterialCost(baseCost, tier.minQty, materialDiscountRules);
    const discount = tier.volumeDiscountPct ?? 0;
    const unitPrice = round2(baseListPrice * (1 - discount / 100));
    const profitPerUnit = round2(unitPrice - effectiveCost);
    const marginPct = unitPrice > 0 ? round2((profitPerUnit / unitPrice) * 100) : 0;
    const totalRevenueAtMin = round2(unitPrice * tier.minQty);
    const totalProfitAtMin = round2(profitPerUnit * tier.minQty);
    const isViable = marginPct >= 10; // Umbral mínimo de salud comercial

    return {
      minQty: tier.minQty,
      maxQty: tier.maxQty ?? null,
      unitCost: effectiveCost,
      unitPrice,
      profitPerUnit,
      marginPct,
      totalRevenueAtMin,
      totalProfitAtMin,
      isViable,
    };
  });
}

/**
 * 3. Punto de Equilibrio (Break-Even) conectado a costos fijos mensuales.
 */
export function calculateBreakEven(input: BreakEvenInput): BreakEvenResult {
  const { fixedCostsMonthly, unitPrice, unitVariableCost, projectedSalesUnits } = input;
  const contributionMarginPerUnit = round2(unitPrice - unitVariableCost);
  const contributionMarginRatio = unitPrice > 0 ? round2(contributionMarginPerUnit / unitPrice) : 0;

  if (contributionMarginPerUnit <= 0) {
    return {
      fixedCostsMonthly,
      unitPrice,
      unitVariableCost,
      contributionMarginPerUnit,
      contributionMarginRatio: 0,
      breakEvenUnits: Infinity,
      breakEvenRevenue: Infinity,
      isCoveringFixedCosts: false,
    };
  }

  const breakEvenUnits = Math.ceil(fixedCostsMonthly / contributionMarginPerUnit);
  const breakEvenRevenue = round2(breakEvenUnits * unitPrice);

  let safetyMarginUnits: number | undefined;
  let safetyMarginPct: number | undefined;

  if (projectedSalesUnits !== undefined && projectedSalesUnits > 0) {
    safetyMarginUnits = projectedSalesUnits - breakEvenUnits;
    safetyMarginPct = round2((safetyMarginUnits / projectedSalesUnits) * 100);
  }

  return {
    fixedCostsMonthly,
    unitPrice,
    unitVariableCost,
    contributionMarginPerUnit,
    contributionMarginRatio,
    breakEvenUnits,
    breakEvenRevenue,
    safetyMarginUnits,
    safetyMarginPct,
    isCoveringFixedCosts: (projectedSalesUnits ?? 0) >= breakEvenUnits,
  };
}

/**
 * 4. Unit Economics: CAC, CRC, LTV y Payback.
 */
export function calculateUnitEconomics(input: UnitEconomicsInput): UnitEconomicsResult {
  const {
    acquisitionSpend,
    newCustomers,
    retentionSpend = 0,
    activeCustomers = 0,
    avgTicket,
    annualPurchaseFrequency,
    customerLifespanYears,
    grossMarginPct,
  } = input;

  const safeNewCustomers = Math.max(newCustomers, 1);
  const cac = round2(acquisitionSpend / safeNewCustomers);

  const safeActiveCustomers = Math.max(activeCustomers, 1);
  const crc = round2(retentionSpend / safeActiveCustomers);

  const marginDecimal = Math.max(grossMarginPct, 0) / 100;
  const annualRevenuePerCustomer = round2(avgTicket * annualPurchaseFrequency);
  const ltv = round2(annualRevenuePerCustomer * customerLifespanYears * marginDecimal);

  const ltvCacRatio = cac > 0 ? round2(ltv / cac) : 0;

  const monthlyGrossProfitPerCustomer = round2((annualRevenuePerCustomer * marginDecimal) / 12);
  const cacPaybackMonths =
    monthlyGrossProfitPerCustomer > 0 ? round2(cac / monthlyGrossProfitPerCustomer) : Infinity;

  let status: HealthStatus;
  let statusMessage: string;

  if (ltvCacRatio < 1) {
    status = 'critical';
    statusMessage = 'Destruyendo caja: cada cliente nuevo cuesta más de lo que genera en su vida útil.';
  } else if (ltvCacRatio < 3) {
    status = 'warning';
    statusMessage = 'Frágil: el margen comercial apenas cubre la operación. Optimiza conversión o sube ticket.';
  } else if (ltvCacRatio <= 5) {
    status = 'healthy';
    statusMessage = 'Saludable: ratio ideal para crecimiento sostenible de pyme (3x - 5x).';
  } else {
    status = 'underinvested';
    statusMessage = 'Oportunidad de acelerar: estás sub-invirtiendo en adquisición dado el alto retorno del cliente.';
  }

  return {
    cac,
    crc,
    ltv,
    ltvCacRatio,
    cacPaybackMonths,
    annualRevenuePerCustomer,
    monthlyGrossProfitPerCustomer,
    status,
    statusMessage,
  };
}

/**
 * 5. Prueba Ácida de Crecimiento Comercial.
 * Valida si el plan de expansión de clientes quebrará o no la caja según el runway de PosBank.
 */
export function runGrowthAcidTest(input: GrowthAcidTestInput): GrowthAcidTestResult {
  const {
    targetNewCustomers,
    estimatedCac,
    availableCash,
    currentRunwayDays,
    daysToCollectReceivables = 30,
    cacPaybackMonths,
  } = input;

  const totalAcquisitionInvestment = round2(targetNewCustomers * estimatedCac);
  const cashDrainPct = availableCash > 0 ? round2((totalAcquisitionInvestment / availableCash) * 100) : 100;
  const estimatedPostInvestmentCash = round2(availableCash - totalAcquisitionInvestment);

  // Estimación de quema de runway:
  // Si quema el 40% de la caja, el runway se reduce proporcionalmente
  const runwayFactor = Math.max(0, 1 - totalAcquisitionInvestment / (availableCash || 1));
  const projectedRunwayDays = Math.round(currentRunwayDays * runwayFactor);

  let riskLevel: 'bajo' | 'medio' | 'alto' | 'critico';
  let isViable = true;
  const recomendaciones: string[] = [];

  if (cashDrainPct >= 70 || estimatedPostInvestmentCash <= 0 || projectedRunwayDays < 30) {
    riskLevel = 'critico';
    isViable = false;
    recomendaciones.push('La inversión comercial absorbe más del 70% de tu caja o te deja menos de 30 días de runway.');
    recomendaciones.push('Escalona la adquisición en cohortes mensuales más pequeñas en vez de invertir todo de golpe.');
  } else if (cashDrainPct >= 40 || projectedRunwayDays < 60) {
    riskLevel = 'alto';
    isViable = false;
    recomendaciones.push('Riesgo de liquidez: el período de recuperación (payback) compite con tus pagos fijos.');
  } else if (cashDrainPct >= 20) {
    riskLevel = 'medio';
    isViable = true;
  } else {
    riskLevel = 'bajo';
    isViable = true;
  }

  if (daysToCollectReceivables > 45 && cacPaybackMonths > 3) {
    recomendaciones.push(
      `Alerta de cartera: Cobras a ${daysToCollectReceivables} días promedio. Exige anticipos o cobro de contado para compensar el CAC.`,
    );
  }

  if (cacPaybackMonths > 6) {
    recomendaciones.push(
      `El payback (${cacPaybackMonths} meses) es lento. Busca estrategias de upsell o cross-sell en el mes 1 para adelantar flujo.`,
    );
  }

  let diagnostico = '';
  if (riskLevel === 'critico') {
    diagnostico = 'Prueba ácida NO superada: Este ritmo de crecimiento ahoga la liquidez inmediata de la empresa.';
  } else if (riskLevel === 'alto') {
    diagnostico = 'Prueba ácida en riesgo: Requiere optimizar capital de trabajo o reducir el CAC antes de acelerar.';
  } else {
    diagnostico = 'Prueba ácida superada: La caja actual tiene suficiente respaldo para absorber la inversión de adquisición.';
  }

  return {
    totalAcquisitionInvestment,
    cashDrainPct,
    isViable,
    riskLevel,
    estimatedPostInvestmentCash,
    projectedRunwayDays,
    diagnostico,
    recomendaciones,
  };
}
