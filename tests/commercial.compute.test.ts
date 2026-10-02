import { describe, it, expect } from 'vitest';
import {
  calculateRawMaterialCost,
  calculatePricingProposal,
  calculateBreakEven,
  calculateUnitEconomics,
  runGrowthAcidTest,
} from '../src/modules/commercial/commercial.compute';

describe('commercial.compute', () => {
  describe('Economías de escala en materiales', () => {
    const rules = [
      { minVolume: 100, discountPct: 10 },
      { minVolume: 500, discountPct: 20 },
      { minVolume: 1000, discountPct: 30 },
    ];

    it('aplica el descuento correcto según el volumen de compra', () => {
      const res50 = calculateRawMaterialCost(10000, 50, rules);
      expect(res50.effectiveCost).toBe(10000);
      expect(res50.discountPct).toBe(0);

      const res200 = calculateRawMaterialCost(10000, 200, rules);
      expect(res200.effectiveCost).toBe(9000);
      expect(res200.discountPct).toBe(10);
      expect(res200.totalSavings).toBe(200000);

      const res1200 = calculateRawMaterialCost(10000, 1200, rules);
      expect(res1200.effectiveCost).toBe(7000);
      expect(res1200.discountPct).toBe(30);
      expect(res1200.totalSavings).toBe(3600000);
    });
  });

  describe('Propuestas de pricing por volumen (Tiered Pricing)', () => {
    it('calcula precios, márgenes y utilidad por unidad en cada escala', () => {
      const tiers = [
        { minQty: 1, maxQty: 10, volumeDiscountPct: 0 },
        { minQty: 11, maxQty: 50, volumeDiscountPct: 5 },
        { minQty: 51, maxQty: null, volumeDiscountPct: 15 },
      ];

      // Costo $50.000, Margen objetivo 40% => Precio base de lista = $50.000 / (1 - 0.40) = $83.333,33
      const proposal = calculatePricingProposal(50000, 40, tiers);

      expect(proposal).toHaveLength(3);
      // Tier 1 (1-10)
      expect(proposal[0].unitPrice).toBeCloseTo(83333.33, 1);
      expect(proposal[0].marginPct).toBeCloseTo(40, 1);
      expect(proposal[0].isViable).toBe(true);

      // Tier 2 (11-50, 5% desc)
      expect(proposal[1].unitPrice).toBeLessThan(proposal[0].unitPrice);
      expect(proposal[1].marginPct).toBeGreaterThan(30);
      expect(proposal[1].isViable).toBe(true);

      // Tier 3 (51+, 15% desc)
      expect(proposal[2].unitPrice).toBeLessThan(proposal[1].unitPrice);
      expect(proposal[2].isViable).toBe(true);
    });
  });

  describe('Punto de Equilibrio (Break-Even)', () => {
    it('calcula unidades mínimas y ventas requeridas para cubrir costos fijos', () => {
      // Costos fijos: $10.000.000/mes
      // Precio: $50.000, Costo variable: $30.000 => Margen de contribución = $20.000 (40%)
      const be = calculateBreakEven({
        fixedCostsMonthly: 10000000,
        unitPrice: 50000,
        unitVariableCost: 30000,
        projectedSalesUnits: 600,
      });

      expect(be.contributionMarginPerUnit).toBe(20000);
      expect(be.contributionMarginRatio).toBe(0.4);
      expect(be.breakEvenUnits).toBe(500); // 10M / 20k = 500 uds
      expect(be.breakEvenRevenue).toBe(25000000); // 500 * 50k = $25M
      expect(be.safetyMarginUnits).toBe(100);
      expect(be.isCoveringFixedCosts).toBe(true);
    });

    it('detecta inviabilidad si el costo variable supera al precio', () => {
      const be = calculateBreakEven({
        fixedCostsMonthly: 5000000,
        unitPrice: 20000,
        unitVariableCost: 25000, // pierde $5.000 por unidad
      });

      expect(be.breakEvenUnits).toBe(Infinity);
      expect(be.isCoveringFixedCosts).toBe(false);
    });
  });

  describe('Unit Economics (CAC, CRC, LTV)', () => {
    it('evalúa ratio saludable de 3x - 5x con payback adecuado', () => {
      const ue = calculateUnitEconomics({
        acquisitionSpend: 2000000, // $2M en pauta
        newCustomers: 20,          // 20 clientes => CAC = $100.000
        retentionSpend: 300000,
        activeCustomers: 50,
        avgTicket: 120000,
        annualPurchaseFrequency: 4, // 4 compras al año
        customerLifespanYears: 2,   // 2 años
        grossMarginPct: 40,         // 40%
      });

      expect(ue.cac).toBe(100000);
      expect(ue.crc).toBe(6000); // 300k / 50 = $6.000
      // Ingreso anual = 120k * 4 = 480k. LTV = 480k * 2 * 0.40 = 384.000
      expect(ue.ltv).toBe(384000);
      expect(ue.ltvCacRatio).toBe(3.84); // Saludable!
      expect(ue.status).toBe('healthy');
      expect(ue.cacPaybackMonths).toBeLessThan(12);
    });

    it('clasifica como crítico si el CAC supera el LTV', () => {
      const ue = calculateUnitEconomics({
        acquisitionSpend: 1500000,
        newCustomers: 3, // CAC = $500.000
        avgTicket: 50000,
        annualPurchaseFrequency: 2,
        customerLifespanYears: 1,
        grossMarginPct: 30, // LTV = 100.000 * 0.30 = $30.000
      });

      expect(ue.cac).toBe(500000);
      expect(ue.ltv).toBe(30000);
      expect(ue.ltvCacRatio).toBe(0.06);
      expect(ue.status).toBe('critical');
    });
  });

  describe('Prueba Ácida de Crecimiento', () => {
    it('detecta plan inviable que agota la caja de la pyme', () => {
      const res = runGrowthAcidTest({
        targetNewCustomers: 100,
        estimatedCac: 150000, // Requiere $15M
        availableCash: 16000000, // Solo tiene $16M en caja
        currentRunwayDays: 90,
        daysToCollectReceivables: 60,
        cacPaybackMonths: 8,
      });

      expect(res.totalAcquisitionInvestment).toBe(15000000);
      expect(res.cashDrainPct).toBeGreaterThan(90);
      expect(res.isViable).toBe(false);
      expect(res.riskLevel).toBe('critico');
      expect(res.recomendaciones.length).toBeGreaterThan(0);
    });

    it('valida plan de crecimiento sostenible con holgura de caja', () => {
      const res = runGrowthAcidTest({
        targetNewCustomers: 20,
        estimatedCac: 100000, // Requiere $2M
        availableCash: 30000000, // Tiene $30M en caja
        currentRunwayDays: 120,
        daysToCollectReceivables: 30,
        cacPaybackMonths: 3,
      });

      expect(res.totalAcquisitionInvestment).toBe(2000000);
      expect(res.cashDrainPct).toBeCloseTo(6.67, 1);
      expect(res.isViable).toBe(true);
      expect(res.riskLevel).toBe('bajo');
    });
  });
});
