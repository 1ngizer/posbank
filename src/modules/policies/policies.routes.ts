import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError, ok } from '../../shared/http';
import { requireAuth, requireRole } from '../../middleware/auth';

export const policiesRouter = Router();

const collectionSchema = z.object({
  maxDays: z.coerce.number().int().min(0).default(30),
  gracePeriodDays: z.coerce.number().int().min(0).default(0),
  autoReminderEnabled: z.boolean().default(false),
  reminderFrequencyDays: z.coerce.number().int().min(1).default(7),
  escalationRules: z.array(z.record(z.unknown())).default([]),
});

const paymentSchema = z.object({
  standardPaymentDays: z.coerce.number().int().min(0).default(30),
  earlyPaymentThresholdDays: z.coerce.number().int().min(0).default(10),
  earlyPaymentDiscountMinPct: z.coerce.number().min(0).max(100).default(0),
});

// GET /api/v1/policies/collection — política de cobro activa (o null).
policiesRouter.get(
  '/collection',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const { data } = await a.db
      .from('collection_policies')
      .select('*')
      .eq('company_id', a.companyId)
      .eq('is_active', true)
      .maybeSingle();
    return ok(res, data ?? null);
  }),
);

// POST /api/v1/policies/collection — define/reemplaza la política de cobro.
policiesRouter.post(
  '/collection',
  requireAuth,
  requireRole('owner', 'manager'),
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const input = collectionSchema.parse(req.body);
    // Desactivar la anterior para mantener una sola activa.
    await a.db
      .from('collection_policies')
      .update({ is_active: false })
      .eq('company_id', a.companyId)
      .eq('is_active', true);
    const { data, error } = await a.db
      .from('collection_policies')
      .insert({
        company_id: a.companyId,
        max_days: input.maxDays,
        grace_period_days: input.gracePeriodDays,
        auto_reminder_enabled: input.autoReminderEnabled,
        reminder_frequency_days: input.reminderFrequencyDays,
        escalation_rules: input.escalationRules,
        is_active: true,
      })
      .select('*')
      .single();
    if (error) throw ApiError.badRequest(error.message);
    return ok(res, data, 201);
  }),
);

// GET /api/v1/policies/payment — política de pago activa (o null).
policiesRouter.get(
  '/payment',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const { data } = await a.db
      .from('payment_policies')
      .select('*')
      .eq('company_id', a.companyId)
      .eq('is_active', true)
      .maybeSingle();
    return ok(res, data ?? null);
  }),
);

// POST /api/v1/policies/payment — define/reemplaza la política de pago.
policiesRouter.post(
  '/payment',
  requireAuth,
  requireRole('owner', 'manager'),
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const input = paymentSchema.parse(req.body);
    await a.db
      .from('payment_policies')
      .update({ is_active: false })
      .eq('company_id', a.companyId)
      .eq('is_active', true);
    const { data, error } = await a.db
      .from('payment_policies')
      .insert({
        company_id: a.companyId,
        standard_payment_days: input.standardPaymentDays,
        early_payment_threshold_days: input.earlyPaymentThresholdDays,
        early_payment_discount_min_pct: input.earlyPaymentDiscountMinPct,
        is_active: true,
      })
      .select('*')
      .single();
    if (error) throw ApiError.badRequest(error.message);
    return ok(res, data, 201);
  }),
);
