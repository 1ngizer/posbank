import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError, ok } from '../../shared/http';
import { requireAuth } from '../../middleware/auth';
import { issueInvoice } from './pos.service';

export const posRouter = Router();

// GET /api/v1/invoices — historial de facturas.
posRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const { data, error } = await a.db
      .from('invoices')
      .select('*')
      .eq('company_id', a.companyId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw ApiError.badRequest(error.message);
    return ok(res, data);
  }),
);

// GET /api/v1/invoices/:id — factura con sus ítems.
posRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const { data: inv, error } = await a.db
      .from('invoices').select('*')
      .eq('company_id', a.companyId).eq('id', req.params.id).single();
    if (error || !inv) throw ApiError.notFound();
    const { data: items } = await a.db
      .from('invoice_items').select('*').eq('invoice_id', inv.id);
    return ok(res, { ...inv, items: items ?? [] });
  }),
);

// POST /api/v1/invoices — emitir factura de venta (integra a caja).
const issueSchema = z.object({
  customerName: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().positive(),
  })).min(1),
});
posRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const input = issueSchema.parse(req.body);
    const invoice = await issueInvoice(a.db, a.companyId, a.userId, input);
    return ok(res, invoice, 201);
  }),
);
