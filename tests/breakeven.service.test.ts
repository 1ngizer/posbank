import { describe, it, expect } from 'vitest';
import { CommercialService } from '../src/modules/commercial/commercial.service';

/** Cliente Supabase simulado: cada tabla devuelve sus filas, sin importar los filtros encadenados. */
function mockDb(tables: Record<string, unknown[]>) {
  const db: any = {
    from(table: string) {
      const chain: any = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              return (resolve: (v: unknown) => void) => resolve({ data: tables[table] ?? [], error: null });
            }
            return () => chain;
          },
        },
      );
      return chain;
    },
  };
  return db;
}

const A = { id: 'a', name: 'Producto A', price: 10000, cost: 6000 };
const B = { id: 'b', name: 'Producto B', price: 5000, cost: 4000 };

const item = (product_id: string | null, quantity: number, line_total: number, created_at: string) => ({
  product_id,
  quantity,
  line_total,
  invoices: { status: 'issued', created_at },
});

describe('CommercialService.getBreakEvenOverview', () => {
  // "Ahora" = 2026-10-10 12:00 en Bogotá (17:00 UTC). Ventana de 30 días: desde 2026-09-10 17:00 UTC.
  // El mes de Bogotá empezó el 2026-10-01 05:00 UTC.
  const now = new Date('2026-10-10T17:00:00Z');
  const tables = {
    fixed_commitments: [{ amount: 1_000_000, frequency: 'monthly', is_active: true }],
    products: [A, B],
    invoice_items: [
      item('a', 100, 1_000_000, '2026-10-05T15:00:00Z'), // en la ventana y en el mes
      item('a', 100, 1_000_000, '2026-09-25T15:00:00Z'), // en la ventana, mes anterior
      item('a', 10, 100_000, '2026-10-01T04:30:00Z'), // 30-sep 23:30 en Bogotá: ventana sí, mes NO
      item('a', 999, 9_999_999, '2026-08-01T15:00:00Z'), // fuera de la ventana: se ignora
      item(null, 5, 500_000, '2026-10-06T15:00:00Z'), // sin producto del inventario
    ],
  };

  it('suma por producto solo lo que cae dentro de la ventana', async () => {
    const out = await CommercialService.getBreakEvenOverview(mockDb(tables), 'c1', 30, 'none', now);
    const a = out.products.find((p) => p.id === 'a')!;
    expect(a.unitsPerMonth).toBe(210); // 100 + 100 + 10, sin las 999 de agosto
    expect(a.revenuePerMonth).toBe(2_100_000);
    expect(a.contributionPerMonth).toBe(840_000); // 2.100.000 - 6.000 × 210
    expect(out.products.find((p) => p.id === 'b')!.status).toBe('no_sales');
  });

  it('toma los costos fijos de los compromisos de la empresa', async () => {
    const out = await CommercialService.getBreakEvenOverview(mockDb(tables), 'c1', 30, 'none', now);
    expect(out.company.fixedCostsMonthly).toBe(1_000_000);
  });

  it('el mes en curso empieza a las 00:00 de Bogotá, no de UTC', async () => {
    const out = await CommercialService.getBreakEvenOverview(mockDb(tables), 'c1', 30, 'none', now);
    // Solo la factura del 5 de octubre cuenta para el mes: 1.000.000 - 6.000 × 100 = 400.000
    expect(out.company.monthToDate).toEqual({ coveredPct: 40, dayOfMonth: 10, onTrack: true });
  });

  it('informa las ventas sin producto del inventario y las deja fuera del cálculo', async () => {
    const out = await CommercialService.getBreakEvenOverview(mockDb(tables), 'c1', 30, 'none', now);
    expect(out.unassignedRevenuePerMonth).toBe(500_000);
    expect(out.company.revenuePerMonth).toBe(2_100_000);
    expect(out.notes.join(' ')).toMatch(/sin producto del inventario/);
  });

  it('con una empresa sin ventas ni productos no falla', async () => {
    const empty = mockDb({ fixed_commitments: [], products: [], invoice_items: [] });
    const out = await CommercialService.getBreakEvenOverview(empty, 'c1', 60, 'sales', now);
    expect(out.products).toEqual([]);
    expect(out.company.viable).toBe(false);
    expect(out.company.message).toMatch(/costos fijos registrados/);
  });
});
