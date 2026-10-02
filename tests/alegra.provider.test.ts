import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlegraProvider } from '../src/integrations/accounting/alegra/alegra.provider';

describe('AlegraProvider', () => {
  const mockCredentials = {
    email: 'test@posbank.co',
    token: 'test_token_12345',
  };

  let provider: AlegraProvider;
  const originalFetch = global.fetch;

  beforeEach(() => {
    provider = new AlegraProvider(mockCredentials);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('testConnection devuelve true si la autenticación responde 200', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 1, name: 'Mi Empresa SAS' })),
    } as any);

    const result = await provider.testConnection();
    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.alegra.com/api/v1/company',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('test@posbank.co:test_token_12345').toString('base64')}`,
        }),
      }),
    );
  });

  it('testConnection devuelve false si la API responde 401 Unauthorized', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ message: 'Unauthorized' })),
    } as any);

    const result = await provider.testConnection();
    expect(result).toBe(false);
  });

  it('syncInvoice formatea y envía la factura a Alegra correctamente', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: () => Promise.resolve(JSON.stringify({ id: 9876, numberTemplate: { number: 101 } })),
    } as any);

    const res = await provider.syncInvoice({
      id: 'inv-uuid-1',
      number: 'POS-001',
      customerName: 'Juan Pérez',
      subtotal: 50000,
      tax: 9500,
      total: 59500,
      items: [
        {
          description: 'Café Especial 500g',
          quantity: 2,
          unitPrice: 25000,
          taxRate: 19,
          lineTotal: 50000,
        },
      ],
      date: '2026-10-02',
    });

    expect(res.success).toBe(true);
    expect(res.externalId).toBe('9876');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.alegra.com/api/v1/invoices',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          date: '2026-10-02',
          dueDate: '2026-10-02',
          client: { name: 'Juan Pérez' },
          items: [
            {
              name: 'Café Especial 500g',
              price: 25000,
              quantity: 2,
              tax: [{ id: 1, percentage: 19 }],
            },
          ],
          anotation: 'Factura POS emitida desde PosBank (POS-001)',
        }),
      }),
    );
  });

  it('syncReceivable sincroniza una cuenta por cobrar', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: () => Promise.resolve(JSON.stringify({ id: 5432 })),
    } as any);

    const res = await provider.syncReceivable({
      id: 'rec-uuid-1',
      clientName: 'Restaurante El Sol',
      clientId: '900123456',
      amount: 150000,
      dueDate: '2026-10-20',
      issuedDate: '2026-10-02',
      status: 'pending',
    });

    expect(res.success).toBe(true);
    expect(res.externalId).toBe('5432');
  });

  it('syncPayable sincroniza una cuenta por pagar como factura de compra (bill)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: () => Promise.resolve(JSON.stringify({ id: 8877 })),
    } as any);

    const res = await provider.syncPayable({
      id: 'pay-uuid-1',
      supplierName: 'Distribuidora Lácteos SAS',
      supplierId: '800555444',
      amount: 80000,
      dueDate: '2026-10-15',
      notes: 'Insumos lácteos octubre',
    });

    expect(res.success).toBe(true);
    expect(res.externalId).toBe('8877');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.alegra.com/api/v1/bills',
      expect.anything(),
    );
  });

  it('syncMovement sincroniza un movimiento de caja como payment', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: () => Promise.resolve(JSON.stringify({ id: 7711 })),
    } as any);

    const res = await provider.syncMovement({
      id: 'mov-uuid-1',
      type: 'expense',
      amount: 25000,
      category: 'utilities',
      description: 'Pago recibo de agua',
      date: '2026-10-02',
    });

    expect(res.success).toBe(true);
    expect(res.externalId).toBe('7711');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.alegra.com/api/v1/payments',
      expect.anything(),
    );
  });

  it('captura errores de la API sin romper la ejecución', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ message: 'El cliente no tiene NIT válido' })),
    } as any);

    const res = await provider.syncInvoice({
      id: 'inv-err',
      subtotal: 100,
      tax: 0,
      total: 100,
      items: [],
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('El cliente no tiene NIT válido');
  });
});
