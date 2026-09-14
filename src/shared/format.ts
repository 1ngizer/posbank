/** Formatea un monto en pesos colombianos: 8500000 → "$8.500.000". */
export function formatCOP(amount: number): string {
  const rounded = Math.round(amount);
  const formatted = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(rounded);
  return formatted;
}

/** Versión compacta para lenguaje gerencial: 8500000 → "$8,5M". */
export function formatCOPShort(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${round1(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${round1(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace('.', ',');
}
