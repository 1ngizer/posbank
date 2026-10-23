/** Resumen financiero de solo lectura que Ingizer usa para su módulo de valoración. Sin datos personales. */
export interface MovimientoVenta {
  amount: number | string;
  date: string; // AAAA-MM-DD
}

export interface ResumenIngizer {
  ok: true;
  /** Meses entre el primer movimiento y hoy (máximo 120). */
  mesesDeHistorial: number;
  /** Ingresos por ventas de los últimos 12 meses. */
  ventasUltimos12Meses: number;
  /** Suma de los saldos de las cuentas bancarias registradas. */
  cajaActual: number;
}

function mesesEntre(desde: Date, hasta: Date): number {
  const m = (hasta.getUTCFullYear() - desde.getUTCFullYear()) * 12 + (hasta.getUTCMonth() - desde.getUTCMonth());
  return Math.max(0, Math.min(120, m + (hasta.getUTCDate() >= desde.getUTCDate() ? 1 : 0)));
}

/**
 * @param ventas ingresos de la categoría "sales" de toda la historia (ya filtrados por empresa)
 * @param saldos saldos actuales de las cuentas bancarias
 */
export function calcularResumenIngizer(ventas: MovimientoVenta[], saldos: (number | string)[], hoy = new Date()): ResumenIngizer {
  const limite = new Date(Date.UTC(hoy.getUTCFullYear() - 1, hoy.getUTCMonth(), hoy.getUTCDate()));
  let primero: Date | null = null;
  let total12 = 0;
  for (const v of ventas) {
    const d = new Date(v.date + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) continue;
    if (!primero || d < primero) primero = d;
    if (d > limite && d <= hoy) total12 += Number(v.amount) || 0;
  }
  return {
    ok: true,
    mesesDeHistorial: primero ? mesesEntre(primero, hoy) : 0,
    ventasUltimos12Meses: Math.round(total12),
    cajaActual: Math.round(saldos.reduce<number>((s, x) => s + (Number(x) || 0), 0)),
  };
}
