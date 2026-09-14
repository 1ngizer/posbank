import { useState } from 'react';
import { copShort, cop } from '../../lib/format';
import './charts.css';

export interface TrendPoint { weekStart: string; income: number; expense: number; net: number }

/** Línea de evolución (una serie: flujo de caja neto por semana). */
export function TrendChart({ data, height = 180 }: { data: TrendPoint[]; height?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 600, H = height, padL = 12, padR = 12, padT = 14, padB = 24;
  const n = data.length;

  if (n === 0 || data.every((d) => d.net === 0 && d.income === 0 && d.expense === 0)) {
    return <div className="chart-empty">Sin movimientos en el periodo.</div>;
  }

  const values = data.map((d) => d.net);
  const yMax = Math.max(0, ...values);
  const yMin = Math.min(0, ...values);
  const range = yMax - yMin || 1;

  const px = (i: number) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR);
  const py = (v: number) => padT + (1 - (v - yMin) / range) * (H - padT - padB);
  const zeroY = py(0);

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(d.net).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${px(n - 1).toFixed(1)},${zeroY.toFixed(1)} L${px(0).toFixed(1)},${zeroY.toFixed(1)} Z`;

  const fmtWeek = (iso: string) => { const [, m, d] = iso.split('-'); return `${+d}/${+m}`; };

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" role="img"
        aria-label="Evolución del flujo de caja neto por semana">
        {/* baseline en 0 */}
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} className="chart-axis" />
        {/* área + línea */}
        <path d={areaPath} className="chart-area" />
        <path d={linePath} className="chart-line" fill="none" />
        {/* punto activo */}
        {active !== null && (
          <>
            <line x1={px(active)} y1={padT} x2={px(active)} y2={H - padB} className="chart-cross" />
            <circle cx={px(active)} cy={py(data[active].net)} r={4.5} className="chart-dot" />
          </>
        )}
        {/* etiquetas x (primera, media, última) */}
        {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
          <text key={i} x={px(i)} y={H - 7} className="chart-xlab" textAnchor="middle">{fmtWeek(data[i].weekStart)}</text>
        ))}
        {/* hit areas por semana */}
        {data.map((_, i) => (
          <rect key={i} x={px(i) - (W - padL - padR) / (2 * Math.max(1, n - 1))} y={0}
            width={(W - padL - padR) / Math.max(1, n - 1)} height={H} fill="transparent"
            onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} />
        ))}
      </svg>
      {active !== null && (
        <div className="chart-tip" style={{ left: `${(px(active) / W) * 100}%` }}>
          <div className="tip-lbl">Semana {fmtWeek(data[active].weekStart)}</div>
          <div className="tip-val" style={{ color: data[active].net >= 0 ? 'var(--green-ink)' : 'var(--bad-ink)' }}>
            Neto {cop(data[active].net)}
          </div>
          <div className="tip-sub">+{copShort(data[active].income)} · −{copShort(data[active].expense)}</div>
        </div>
      )}
    </div>
  );
}
