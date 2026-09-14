import { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '../../shared/http';
import { createMovement } from '../movements/movements.service';
import { SourceChannel } from '../../shared/types';

export interface InvoiceItemInput {
  productId: string;
  quantity: number;
}
export interface IssueInvoiceInput {
  customerName?: string;
  items: InvoiceItemInput[];
  sourceChannel?: SourceChannel;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Emite una factura POS. Solo vende producto TERMINADO. El flujo (secuencial,
 * validando todo antes de escribir):
 *   1. Valida productos (terminados, activos, con stock suficiente).
 *   2. Calcula subtotal + IVA (por producto) + total.
 *   3. Crea la factura y sus ítems.
 *   4. Descuenta stock y registra el kardex (type 'sale').
 *   5. Crea el INGRESO en caja (cash_movements) y lo enlaza a la factura.
 */
export async function issueInvoice(
  db: SupabaseClient,
  companyId: string,
  userId: string | null,
  input: IssueInvoiceInput,
) {
  if (!input.items?.length) throw ApiError.badRequest('La factura no tiene productos');

  // 1) Traer los productos involucrados.
  const ids = [...new Set(input.items.map((i) => i.productId))];
  const { data: products, error: pErr } = await db
    .from('products')
    .select('id, name, category, price, tax_rate, stock, is_active')
    .eq('company_id', companyId)
    .in('id', ids);
  if (pErr) throw ApiError.badRequest(pErr.message);
  const byId = new Map((products ?? []).map((p) => [p.id, p]));

  // 2) Validar y armar las líneas.
  const lines = input.items.map((it) => {
    const p = byId.get(it.productId);
    if (!p) throw ApiError.badRequest('Producto no encontrado en la factura');
    if (!p.is_active) throw ApiError.badRequest(`"${p.name}" está inactivo`);
    if (p.category !== 'finished')
      throw ApiError.badRequest(`Solo se puede vender producto terminado ("${p.name}")`);
    if (it.quantity <= 0) throw ApiError.badRequest('Cantidad inválida');
    if (Number(p.stock) < it.quantity)
      throw ApiError.badRequest(`Stock insuficiente de "${p.name}" (hay ${p.stock})`);

    const unitPrice = Number(p.price);
    const taxRate = Number(p.tax_rate);
    const lineTotal = round2(unitPrice * it.quantity);
    const lineTax = round2((lineTotal * taxRate) / 100);
    return {
      product: p, quantity: it.quantity, unitPrice, taxRate, lineTotal, lineTax,
    };
  });

  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const tax = round2(lines.reduce((s, l) => s + l.lineTax, 0));
  const total = round2(subtotal + tax);

  // 3) Consecutivo simple por empresa.
  const { count } = await db
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);
  const number = `F-${String((count ?? 0) + 1).padStart(4, '0')}`;

  const { data: invoice, error: iErr } = await db
    .from('invoices')
    .insert({
      company_id: companyId,
      number,
      customer_name: input.customerName ?? null,
      subtotal, tax, total,
      status: 'issued',
    })
    .select('*')
    .single();
  if (iErr || !invoice) throw ApiError.badRequest(iErr?.message ?? 'No se pudo crear la factura');

  // 4) Ítems.
  const itemRows = lines.map((l) => ({
    company_id: companyId,
    invoice_id: invoice.id,
    product_id: l.product.id,
    description: l.product.name,
    quantity: l.quantity,
    unit_price: l.unitPrice,
    tax_rate: l.taxRate,
    line_total: l.lineTotal,
  }));
  await db.from('invoice_items').insert(itemRows);

  // 5) Descontar stock + kardex.
  for (const l of lines) {
    await db.from('products').update({ stock: Number(l.product.stock) - l.quantity })
      .eq('company_id', companyId).eq('id', l.product.id);
    await db.from('stock_movements').insert({
      company_id: companyId, product_id: l.product.id,
      type: 'sale', quantity: -l.quantity, note: `Factura ${number}`,
    });
  }

  // 6) Ingreso en caja → alimenta el radar.
  const movement = await createMovement(db, {
    companyId,
    userId,
    type: 'income',
    amount: total,
    category: 'sales',
    description: `Factura ${number}${input.customerName ? ' · ' + input.customerName : ''}`,
    sourceChannel: input.sourceChannel ?? 'app',
  });
  await db.from('invoices').update({ cash_movement_id: movement.id }).eq('id', invoice.id);

  return { ...invoice, cash_movement_id: movement.id, items: itemRows };
}
