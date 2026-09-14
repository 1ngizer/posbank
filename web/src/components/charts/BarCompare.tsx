import { cop, copShort } from '../../lib/format';
import './charts.css';

export interface BarItem { id: string; label: string; value: number }

/**
 * Comparativa entre clientes: barras horizontales, una serie (un color).
 * Valor con etiqueta directa al final (pocas barras → legible).
 */
export function BarCompare({ items, unit = 'money' }: { items: BarItem[]; unit?: 'money' | 'days' | 'pct' }) {
  if (items.length === 0) return <div className="chart-empty">Sin datos para comparar.</div>;
  const max = Math.max(1, ...items.map((i) => i.value));
  const fmt = (v: number) =>
    unit === 'money' ? copShort(v) : unit === 'days' ? (v >= 9999 ? '∞' : `${v}d`) : `${v}%`;
  const sorted = [...items].sort((a, b) => b.value - a.value);

  return (
    <div className="bars" role="img" aria-label="Comparativa entre clientes">
      {sorted.map((it) => (
        <div key={it.id} className="bar-row" title={unit === 'money' ? cop(it.value) : fmt(it.value)}>
          <div className="bar-lbl">{it.label}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }} />
          </div>
          <div className="bar-val num">{fmt(it.value)}</div>
        </div>
      ))}
    </div>
  );
}
