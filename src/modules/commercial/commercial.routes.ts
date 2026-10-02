import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, ok, ApiError } from '../../shared/http';
import { CommercialService } from './commercial.service';
import {
  calculateBreakEven,
  calculatePricingProposal,
  calculateUnitEconomics,
  runGrowthAcidTest,
} from './commercial.compute';
import { runCashEngine } from '../analysis/cash-engine';

export const commercialRouter = Router();
commercialRouter.use(requireAuth);

/**
 * GET /api/v1/commercial/break-even
 * Calcula el punto de equilibrio utilizando los compromisos fijos de la empresa (fixed_commitments).
 */
commercialRouter.get(
  '/break-even',
  asyncHandler(async (req, res) => {
    const { db, companyId } = req.auth!;
    const fixedCostsMonthly = await CommercialService.getMonthlyFixedCosts(db, companyId);

    const unitPrice = req.query.unitPrice ? Number(req.query.unitPrice) : undefined;
    const unitVariableCost = req.query.unitVariableCost ? Number(req.query.unitVariableCost) : undefined;
    const projectedSalesUnits = req.query.projectedSalesUnits ? Number(req.query.projectedSalesUnits) : undefined;

    let calculation = null;
    if (unitPrice !== undefined && unitVariableCost !== undefined) {
      calculation = calculateBreakEven({
        fixedCostsMonthly,
        unitPrice,
        unitVariableCost,
        projectedSalesUnits,
      });
    }

    return ok(res, {
      fixedCostsMonthly,
      calculation,
    });
  }),
);

/**
 * POST /api/v1/commercial/simulate-pricing
 * Simula escalas de precios por volumen y economías de escala en compras de insumos.
 */
commercialRouter.post(
  '/simulate-pricing',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      baseCost: z.coerce.number().positive(),
      targetMarginPct: z.coerce.number().min(1).max(99).default(35),
      tiers: z.array(
        z.object({
          minQty: z.number().int().positive(),
          maxQty: z.number().int().positive().nullable().optional(),
          volumeDiscountPct: z.number().min(0).max(80).default(0),
        }),
      ),
      materialDiscountRules: z
        .array(
          z.object({
            minVolume: z.number().positive(),
            discountPct: z.number().min(0).max(90),
          }),
        )
        .optional()
        .default([]),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Datos de simulación inválidos', parsed.error.flatten().fieldErrors);
    }

    const { baseCost, targetMarginPct, tiers, materialDiscountRules } = parsed.data;
    const proposalTiers = calculatePricingProposal(
      baseCost,
      targetMarginPct,
      tiers,
      materialDiscountRules,
    );

    return ok(res, {
      baseCost,
      targetMarginPct,
      tiers: proposalTiers,
    });
  }),
);

/**
 * POST /api/v1/commercial/simulate-unit-economics
 * Simula métricas de CAC, CRC, LTV y período de recuperación (payback).
 */
commercialRouter.post(
  '/simulate-unit-economics',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      acquisitionSpend: z.coerce.number().nonnegative(),
      newCustomers: z.coerce.number().int().nonnegative(),
      retentionSpend: z.coerce.number().nonnegative().optional().default(0),
      activeCustomers: z.coerce.number().int().nonnegative().optional().default(0),
      avgTicket: z.coerce.number().positive(),
      annualPurchaseFrequency: z.coerce.number().positive().default(1),
      customerLifespanYears: z.coerce.number().positive().default(1),
      grossMarginPct: z.coerce.number().min(1).max(100).default(35),
      save: z.boolean().optional().default(false),
      periodMonth: z.number().int().min(1).max(12).optional(),
      periodYear: z.number().int().min(2000).max(2100).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Métricas de unit economics inválidas', parsed.error.flatten().fieldErrors);
    }

    const input = parsed.data;
    const result = calculateUnitEconomics(input);

    if (input.save && input.periodMonth && input.periodYear) {
      const { db, companyId } = req.auth!;
      await CommercialService.saveUnitEconomics(db, companyId, {
        periodMonth: input.periodMonth,
        periodYear: input.periodYear,
        marketingSpend: input.acquisitionSpend,
        salesSpend: 0,
        newCustomers: input.newCustomers,
        retentionSpend: input.retentionSpend,
        activeCustomers: input.activeCustomers,
        avgTicket: input.avgTicket,
        purchaseFreqAnnual: input.annualPurchaseFrequency,
        avgLifespanYears: input.customerLifespanYears,
        grossMarginPct: input.grossMarginPct,
      });
    }

    return ok(res, result);
  }),
);

/**
 * POST /api/v1/commercial/growth-acid-test
 * Prueba ácida de crecimiento: evalúa si la inversión comercial en nuevos clientes
 * ahoga o no la caja según el saldo real y runway de PosBank.
 */
commercialRouter.post(
  '/growth-acid-test',
  asyncHandler(async (req, res) => {
    const { db, companyId } = req.auth!;

    const schema = z.object({
      targetNewCustomers: z.coerce.number().int().positive(),
      estimatedCac: z.coerce.number().positive(),
      cacPaybackMonths: z.coerce.number().positive().default(6),
      daysToCollectReceivables: z.coerce.number().nonnegative().optional(),
      customAvailableCash: z.coerce.number().nonnegative().optional(),
      customRunwayDays: z.coerce.number().nonnegative().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Parámetros de prueba ácida inválidos', parsed.error.flatten().fieldErrors);
    }

    const data = parsed.data;

    let availableCash = data.customAvailableCash;
    let runwayDays = data.customRunwayDays;

    // Si no se proporcionaron valores personalizados, consultamos el motor de caja real
    if (availableCash === undefined || runwayDays === undefined) {
      const analysis = await runCashEngine(companyId, db);
      if (availableCash === undefined) availableCash = analysis.cashPosition.totalAvailable;
      if (runwayDays === undefined) runwayDays = analysis.runway.days >= 9999 ? 365 : analysis.runway.days;
    }

    const acidTestResult = runGrowthAcidTest({
      targetNewCustomers: data.targetNewCustomers,
      estimatedCac: data.estimatedCac,
      availableCash,
      currentRunwayDays: runwayDays,
      daysToCollectReceivables: data.daysToCollectReceivables ?? 30,
      cacPaybackMonths: data.cacPaybackMonths,
    });

    return ok(res, {
      ...acidTestResult,
      availableCashUsed: availableCash,
      currentRunwayDaysUsed: runwayDays,
    });
  }),
);

/**
 * GET & POST /api/v1/commercial/proposals
 */
commercialRouter.get(
  '/proposals',
  asyncHandler(async (req, res) => {
    const { db, companyId } = req.auth!;
    const proposals = await CommercialService.listProposals(db, companyId);
    return ok(res, proposals);
  }),
);

commercialRouter.post(
  '/proposals',
  asyncHandler(async (req, res) => {
    const { db, companyId } = req.auth!;

    const schema = z.object({
      title: z.string().min(1),
      clientName: z.string().min(1),
      productId: z.string().uuid().nullable().optional(),
      baseCost: z.coerce.number().nonnegative(),
      targetMarginPct: z.coerce.number().min(0).max(99).default(35),
      tiers: z.array(z.any()),
      notes: z.string().optional(),
      status: z.enum(['draft', 'sent', 'accepted', 'rejected']).default('draft'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Datos de la propuesta inválidos', parsed.error.flatten().fieldErrors);
    }

    const saved = await CommercialService.saveProposal(db, companyId, parsed.data);
    return ok(res, saved, 201);
  }),
);

commercialRouter.delete(
  '/proposals/:id',
  asyncHandler(async (req, res) => {
    const { db, companyId } = req.auth!;
    await CommercialService.deleteProposal(db, companyId, req.params.id);
    return ok(res, { deleted: true });
  }),
);
