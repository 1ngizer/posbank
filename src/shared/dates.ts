/**
 * Utilidades de fecha ancladas a la zona horaria de Colombia (America/Bogota,
 * UTC-5 sin horario de verano). Trabajamos con strings YYYY-MM-DD para casar
 * con las columnas `date` de Postgres.
 */
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC-5

/** Fecha "hoy" en Bogotá como YYYY-MM-DD. */
export function todayBogota(now: Date = new Date()): string {
  return new Date(now.getTime() - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Primer y último día del mes de una fecha dada (YYYY-MM-DD). */
export function monthRange(dateISO: string): { start: string; end: string } {
  const [y, m] = dateISO.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

/** Fecha desplazada N días (YYYY-MM-DD). */
export function addDays(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Diferencia en días entre dos fechas YYYY-MM-DD (a - b). */
export function daysBetween(aISO: string, bISO: string): number {
  const a = Date.parse(`${aISO}T00:00:00Z`);
  const b = Date.parse(`${bISO}T00:00:00Z`);
  return Math.round((a - b) / (24 * 60 * 60 * 1000));
}
