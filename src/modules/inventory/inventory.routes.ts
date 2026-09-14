import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError, ok } from '../../shared/http';
import { requireAuth } from '../../middleware/auth';

export const inventoryRouter = Router();

const categoryEnum = z.enum(['raw', 'wip', 'finished']);

const createSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  category: categoryEnum.default('finished'),
  photoUrl: z.string().url().optional(),
  unit: z.string().default('unidad'),
  cost: z.coerce.number().min(0).default(0),
  price: z.coerce.number().min(0).default(0),
  taxRate: z.coerce.number().min(0).max(100).default(19),
  stock: z.coerce.number().min(0).default(0),
  minStock: z.coerce.number().min(0).default(0),
});

const updateSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const toRow = (i: z.infer<typeof updateSchema>) => {
  const r: Record<string, unknown> = {};
  if (i.name !== undefined) r.name = i.name;
  if (i.sku !== undefined) r.sku = i.sku;
  if (i.category !== undefined) r.category = i.category;
  if (i.photoUrl !== undefined) r.photo_url = i.photoUrl;
  if (i.unit !== undefined) r.unit = i.unit;
  if (i.cost !== undefined) r.cost = i.cost;
  if (i.price !== undefined) r.price = i.price;
  if (i.taxRate !== undefined) r.tax_rate = i.taxRate;
  if (i.stock !== undefined) r.stock = i.stock;
  if (i.minStock !== undefined) r.min_stock = i.minStock;
  if (i.isActive !== undefined) r.is_active = i.isActive;
  return r;
};

// GET /api/v1/products?category=finished — lista de productos activos.
inventoryRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const category = categoryEnum.optional().parse(req.query.category);
    let q = a.db
      .from('products')
      .select('*')
      .eq('company_id', a.companyId)
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (category) q = q.eq('category', category);
    const { data, error } = await q;
    if (error) throw ApiError.badRequest(error.message);
    return ok(res, data);
  }),
);

// POST /api/v1/products — crear producto.
inventoryRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const input = createSchema.parse(req.body);
    const { data, error } = await a.db
      .from('products')
      .insert({ company_id: a.companyId, ...toRow(input) })
      .select('*')
      .single();
    if (error) throw ApiError.badRequest(error.message);
    return ok(res, data, 201);
  }),
);

// PATCH /api/v1/products/:id — editar producto.
inventoryRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const input = updateSchema.parse(req.body);
    const { data, error } = await a.db
      .from('products')
      .update(toRow(input))
      .eq('company_id', a.companyId)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw ApiError.badRequest(error.message);
    if (!data) throw ApiError.notFound();
    return ok(res, data);
  }),
);

// POST /api/v1/products/:id/stock — ajustar stock (delta) y registrar kardex.
const stockSchema = z.object({
  quantity: z.coerce.number(), // +entra / -sale
  type: z.enum(['in', 'out', 'adjust', 'production']).default('adjust'),
  note: z.string().optional(),
});
inventoryRouter.post(
  '/:id/stock',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const input = stockSchema.parse(req.body);

    const { data: prod, error: pErr } = await a.db
      .from('products')
      .select('id, stock')
      .eq('company_id', a.companyId)
      .eq('id', req.params.id)
      .single();
    if (pErr || !prod) throw ApiError.notFound('Producto no encontrado');

    const newStock = Number(prod.stock) + input.quantity;
    if (newStock < 0) throw ApiError.badRequest('El stock no puede quedar negativo');

    const { data, error } = await a.db
      .from('products')
      .update({ stock: newStock })
      .eq('company_id', a.companyId)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw ApiError.badRequest(error.message);

    await a.db.from('stock_movements').insert({
      company_id: a.companyId,
      product_id: req.params.id,
      type: input.type,
      quantity: input.quantity,
      note: input.note ?? null,
    });

    return ok(res, data);
  }),
);
