import { describe, it, expect } from 'vitest';
import { parseMessage, parseSpanishAmount } from '../src/integrations/whatsapp/parser';

describe('parseSpanishAmount', () => {
  it.each([
    ['500 mil', 500_000],
    ['120 mil', 120_000],
    ['1.2 millones', 1_200_000],
    ['un millon', 1_000_000],
    ['medio millon', 500_000],
    ['300000', 300_000],
    ['$450.000', 450_000],
    ['2M', 2_000_000],
  ])('interpreta "%s" como %i', (input, expected) => {
    expect(parseSpanishAmount(input)).toBe(expected);
  });
});

describe('parseMessage', () => {
  it('registra un ingreso de ventas', () => {
    const r = parseMessage('Vendí 500 mil en efectivo');
    expect(r.kind).toBe('register_movement');
    if (r.kind === 'register_movement') {
      expect(r.type).toBe('income');
      expect(r.amount).toBe(500_000);
      expect(r.category).toBe('sales');
    }
  });

  it('registra un egreso de servicios (luz)', () => {
    const r = parseMessage('Pagué 120 mil de luz');
    expect(r.kind).toBe('register_movement');
    if (r.kind === 'register_movement') {
      expect(r.type).toBe('expense');
      expect(r.category).toBe('utilities');
      expect(r.amount).toBe(120_000);
    }
  });

  it('detecta consulta de caja', () => {
    expect(parseMessage('¿Cómo está mi caja?').kind).toBe('query_cash');
  });

  it('detecta consulta de cartera', () => {
    expect(parseMessage('¿Cuánto me deben?').kind).toBe('query_receivables');
  });

  it('detecta consulta de runway', () => {
    expect(parseMessage('¿Cuál es mi runway?').kind).toBe('query_runway');
  });

  it('mensaje sin sentido → unknown', () => {
    expect(parseMessage('hola qué tal').kind).toBe('unknown');
  });
});
