import { describe, it, expect } from 'vitest';
import { calcularResumenIngizer } from '../src/integrations/ingizer/ingizer.compute';

const hoy = new Date('2026-10-23T12:00:00Z');

describe('resumen para Ingizer', () => {
  it('suma solo las ventas de los últimos 12 meses y cuenta los meses de historial', () => {
    const r = calcularResumenIngizer(
      [
        { amount: '1000000', date: '2025-01-10' }, // fuera de los 12 meses
        { amount: '2000000', date: '2025-11-05' },
        { amount: 3000000, date: '2026-10-01' },
      ],
      ['500000.50', 250000],
      hoy,
    );
    expect(r.ventasUltimos12Meses).toBe(5000000);
    expect(r.cajaActual).toBe(750001);
    expect(r.mesesDeHistorial).toBe(22);
  });

  it('sin movimientos devuelve ceros', () => {
    const r = calcularResumenIngizer([], [], hoy);
    expect(r).toEqual({ ok: true, mesesDeHistorial: 0, ventasUltimos12Meses: 0, cajaActual: 0 });
  });

  it('ignora fechas inválidas y futuras', () => {
    const r = calcularResumenIngizer([{ amount: 10, date: 'xx' }, { amount: 99, date: '2027-01-01' }], [], hoy);
    expect(r.ventasUltimos12Meses).toBe(0);
  });
});
