/** Formatea pesos colombianos: 8500000 → "$8.500.000". */
export function cop(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(Math.round(amount ?? 0));
}

/** Compacto: 8500000 → "$8,5M". */
export function copShort(amount: number): string {
  const abs = Math.abs(amount ?? 0);
  const sign = amount < 0 ? '-' : '';
  const r = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');
  if (abs >= 1_000_000) return `${sign}$${r(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${r(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

export type ChipKind = 'ok' | 'warn' | 'bad' | 'info';

/** Etiqueta legible + tipo de chip para cada estado del radar. */
export const STATE_LABEL: Record<string, { label: string; kind: ChipKind; dot: string }> = {
  // Posición de caja
  surplus: { label: 'Invertir', kind: 'ok', dot: 'var(--g4)' },
  sufficient: { label: 'OK', kind: 'ok', dot: 'var(--g4)' },
  tight: { label: 'Precaución', kind: 'warn', dot: 'var(--g2)' },
  deficit: { label: 'Urgente', kind: 'bad', dot: 'var(--g1)' },
  // Ventas
  exceeds: { label: 'Excedente', kind: 'ok', dot: 'var(--g4)' },
  on_target: { label: 'En línea', kind: 'ok', dot: 'var(--g4)' },
  at_risk: { label: 'Riesgo', kind: 'warn', dot: 'var(--g2)' },
  // Costos
  efficient: { label: 'Eficiente', kind: 'ok', dot: 'var(--g4)' },
  on_budget: { label: 'OK', kind: 'ok', dot: 'var(--g4)' },
  review: { label: 'Revisar', kind: 'warn', dot: 'var(--g2)' },
  deviated: { label: 'Desviado', kind: 'bad', dot: 'var(--g1)' },
  // Cobro
  healthy: { label: 'Sano', kind: 'ok', dot: 'var(--g4)' },
  overdue: { label: 'Cobrar ya', kind: 'bad', dot: 'var(--g1)' },
  no_policy: { label: 'Configurar', kind: 'info', dot: 'var(--g3)' },
  // Pago
  on_time: { label: 'OK', kind: 'ok', dot: 'var(--g4)' },
  early_no_discount: { label: 'Negociar', kind: 'warn', dot: 'var(--g2)' },
  // Runway
  solid: { label: 'Sólido', kind: 'ok', dot: 'var(--g4)' },
  stable: { label: 'Estable', kind: 'ok', dot: 'var(--g4)' },
  alert: { label: 'Alerta', kind: 'warn', dot: 'var(--g2)' },
  emergency: { label: 'Emergencia', kind: 'bad', dot: 'var(--g1)' },
  // fallback
  critical: { label: 'Crítico', kind: 'bad', dot: 'var(--g1)' },
};

export function stateChip(state: string) {
  return STATE_LABEL[state] ?? { label: state, kind: 'info' as ChipKind, dot: 'var(--g3)' };
}

export const SEVERITY_COLOR: Record<string, string> = {
  critical: 'var(--g1)', warning: 'var(--g2)', info: 'var(--g3)', opportunity: 'var(--g4)',
};
