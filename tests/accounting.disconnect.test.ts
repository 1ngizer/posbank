import { describe, it, expect, vi } from 'vitest';
import { AccountingService } from '../src/integrations/accounting/accounting.service';
import { CommercialService } from '../src/modules/commercial/commercial.service';

/** Cliente Supabase simulado: registra la cadena de llamadas y devuelve `result`. */
function mockDb(result: { data?: unknown; error?: { message: string } | null }) {
  const calls: Array<[string, unknown[]]> = [];
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  // Cada método devuelve la misma cadena; al hacer await (o maybeSingle) se resuelve con `resolved`.
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(resolved);
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          if (prop === 'maybeSingle' || prop === 'single') return Promise.resolve(resolved);
          return chain;
        };
      },
    },
  );
  const db: any = { from: vi.fn((table: string) => { calls.push(['from', [table]]); return chain; }) };
  return { db, calls };
}

describe('AccountingService.disconnectProvider', () => {
  it('BORRA la fila (y con ella las credenciales cifradas) en lugar de solo marcarla desconectada', async () => {
    const { db, calls } = mockDb({ error: null });
    await AccountingService.disconnectProvider(db, 'company-1', 'alegra');

    const names = calls.map(([n]) => n);
    expect(names).toContain('delete');
    expect(names).not.toContain('update');
    expect(db.from).toHaveBeenCalledWith('accounting_connections');
    // Filtra por empresa y proveedor (aislamiento multi-tenant)
    expect(calls).toContainEqual(['eq', ['company_id', 'company-1']]);
    expect(calls).toContainEqual(['eq', ['provider', 'alegra']]);
  });

  it('lanza un error 500 si la base de datos falla', async () => {
    const { db } = mockDb({ error: { message: 'boom' } });
    await expect(AccountingService.disconnectProvider(db, 'company-1', 'alegra')).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});

describe('CommercialService.updateProposalStatus', () => {
  it('actualiza solo el estado, filtrando por empresa y por id', async () => {
    const row = { id: 'p1', status: 'accepted' };
    const { db, calls } = mockDb({ data: row, error: null });
    const out = await CommercialService.updateProposalStatus(db, 'company-1', 'p1', 'accepted');

    expect(out).toEqual(row);
    expect(calls).toContainEqual(['update', [{ status: 'accepted' }]]);
    expect(calls).toContainEqual(['eq', ['company_id', 'company-1']]);
    expect(calls).toContainEqual(['eq', ['id', 'p1']]);
  });

  it('responde 404 si la propuesta no existe o es de otra empresa', async () => {
    const { db } = mockDb({ data: null, error: null });
    await expect(CommercialService.updateProposalStatus(db, 'company-1', 'nope', 'sent')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('responde 400 si la base de datos devuelve un error', async () => {
    const { db } = mockDb({ error: { message: 'constraint' } });
    await expect(CommercialService.updateProposalStatus(db, 'company-1', 'p1', 'sent')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
