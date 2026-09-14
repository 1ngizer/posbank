import { describe, it, expect } from 'vitest';
import { mapClaudeResponseToIntent } from '../src/integrations/whatsapp/nlu';

describe('mapClaudeResponseToIntent', () => {
  it('mapea un ingreso con categoría explícita', () => {
    const result = mapClaudeResponseToIntent(
      { kind: 'register_movement', type: 'income', amount: 300_000, category: 'sales' },
      'vendi como 300 lucas hoy',
    );
    expect(result).toEqual({
      kind: 'register_movement',
      type: 'income',
      amount: 300_000,
      category: 'sales',
      description: 'vendi como 300 lucas hoy',
    });
  });

  it('usa una categoría por defecto si Claude no la da', () => {
    const result = mapClaudeResponseToIntent(
      { kind: 'register_movement', type: 'expense', amount: 50_000, category: null },
      'pague 50 lucas de algo',
    );
    expect(result.kind).toBe('register_movement');
    if (result.kind === 'register_movement') {
      expect(result.category).toBe('other');
    }
  });

  it('cae a unknown si dice que vendió pero sin monto', () => {
    const result = mapClaudeResponseToIntent(
      { kind: 'register_movement', type: 'income', amount: null, category: null },
      'hoy vendi bastante',
    );
    expect(result).toEqual({ kind: 'unknown' });
  });

  it('mapea consultas directamente', () => {
    expect(mapClaudeResponseToIntent({ kind: 'query_cash' }, 'como voy')).toEqual({
      kind: 'query_cash',
    });
    expect(mapClaudeResponseToIntent({ kind: 'query_runway' }, 'cuanto me dura')).toEqual({
      kind: 'query_runway',
    });
  });

  it('cae a unknown para kind desconocido o ausente', () => {
    expect(mapClaudeResponseToIntent({ kind: 'unknown' }, 'asdkjasd')).toEqual({ kind: 'unknown' });
  });
});
