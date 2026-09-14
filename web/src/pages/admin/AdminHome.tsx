import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { cop, copShort, stateChip } from '../../lib/format';
import { downloadCsv } from '../../lib/csv';
import { TrendChart, type TrendPoint } from '../../components/charts/TrendChart';
import { BarCompare } from '../../components/charts/BarCompare';
import './Admin.css';

interface Summary {
  id: string; name: string; nit: string | null; size: number | null;
  cashPosition: { state: string; totalAvailable: number };
  runway: { days: number; state: string };
  sales: { percentage: number; state: string; hasBudget: boolean };
  collection: { totalOverdue: number; state: string };
  alerts: { critical: number; warning: number; unread: number };
  lastActivityAt: string | null;
}
interface Overview { companies: number; totalCash: number; totalOverdue: number; atRisk: number; criticalAlerts: number }

const COMPARE = [
  { key: 'cash', label: 'Efectivo', unit: 'money' as const },
  { key: 'runway', label: 'Runway', unit: 'days' as const },
  { key: 'overdue', label: 'Cartera vencida', unit: 'money' as const },
];

export function AdminHome() {
  const [data, setData] = useState<{ overview: Overview; companies: Summary[] } | null>(null);
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  const [compareKey, setCompareKey] = useState('cash');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ overview: Overview; companies: Summary[] }>('/admin/companies').then(setData).catch((e) => setErr(e.message));
    api<{ trend: TrendPoint[] }>('/admin/trends').then((d) => setTrend(d.trend)).catch(() => setTrend([]));
  }, []);

  if (err) return <div className="card" style={{ color: 'var(--bad-ink)' }}>⚠ {err}</div>;
  if (!data) return <div className="center" style={{ minHeight: 300 }}><div className="spin" /></div>;

  const { overview: o, companies } = data;

  const barItems = companies.map((c) => ({
    id: c.id, label: c.name,
    value: compareKey === 'cash' ? c.cashPosition.totalAvailable
      : compareKey === 'runway' ? c.runway.days
      : c.collection.totalOverdue,
  }));
  const barUnit = COMPARE.find((x) => x.key === compareKey)!.unit;

  function exportCsv() {
    downloadCsv('posbank-clientes.csv', companies.map((c) => ({
      Empresa: c.name, NIT: c.nit ?? '', Empleados: c.size ?? '',
      'Estado caja': stateChip(c.cashPosition.state).label,
      'Efectivo disponible': c.cashPosition.totalAvailable,
      'Runway (días)': c.runway.days >= 9999 ? '' : c.runway.days,
      'Ventas %': c.sales.hasBudget ? c.sales.percentage : '',
      'Cartera vencida': c.collection.totalOverdue,
      'Alertas críticas 30d': c.alerts.critical,
      'Últ. actividad': c.lastActivityAt ? new Date(c.lastActivityAt).toLocaleDateString('es-CO') : '',
    })));
  }

  return (
    <div className="admin-page">
      <div className="admin-head admin-head-row">
        <div>
          <div className="eyebrow">Panel Ingizer</div>
          <h1>Tus clientes</h1>
        </div>
        <button className="btn btn-ghost" onClick={exportCsv}>⭳ Exportar CSV</button>
      </div>

      {/* Overview */}
      <div className="ov-grid">
        <div className="ov card"><div className="ov-l">Empresas</div><div className="ov-v num">{o.companies}</div></div>
        <div className="ov card"><div className="ov-l">Efectivo gestionado</div><div className="ov-v num">{copShort(o.totalCash)}</div></div>
        <div className="ov card"><div className="ov-l">En riesgo</div><div className="ov-v num" style={{ color: o.atRisk ? 'var(--bad-ink)' : undefined }}>{o.atRisk}</div></div>
        <div className="ov card"><div className="ov-l">Alertas críticas (30d)</div><div className="ov-v num" style={{ color: o.criticalAlerts ? 'var(--bad-ink)' : undefined }}>{o.criticalAlerts}</div></div>
      </div>

      {/* Gráficas */}
      <div className="admin-charts">
        <div className="card">
          <div className="chart-head"><h3>Evolución del flujo de caja</h3><span className="chart-sub">plataforma · 12 semanas · neto</span></div>
          {trend === null ? <div className="center" style={{ minHeight: 160 }}><div className="spin" /></div>
            : <TrendChart data={trend} />}
        </div>
        <div className="card">
          <div className="chart-head">
            <h3>Comparativa entre clientes</h3>
            <div className="seg seg-sm">
              {COMPARE.map((c) => (
                <button key={c.key} className={compareKey === c.key ? 'on' : ''} onClick={() => setCompareKey(c.key)} type="button">{c.label}</button>
              ))}
            </div>
          </div>
          <BarCompare items={barItems} unit={barUnit} />
        </div>
      </div>

      {/* Lista de clientes */}
      <h2 className="admin-h2">Gestión por cliente</h2>
      <div className="client-list">
        {companies.length === 0 ? <div className="card empty-list">Aún no hay clientes registrados.</div>
        : companies.map((c) => {
          const cash = stateChip(c.cashPosition.state);
          const run = stateChip(c.runway.state);
          return (
            <Link key={c.id} to={`/cliente/${c.id}`} className="client card">
              <div className="client-main">
                <div className="client-name">{c.name}</div>
                <div className="client-sub">
                  {c.size ? `${c.size} empleados · ` : ''}{c.nit ?? 'sin NIT'}
                  {c.lastActivityAt ? ` · últ. actividad ${new Date(c.lastActivityAt).toLocaleDateString('es-CO')}` : ' · sin actividad'}
                </div>
              </div>
              <div className="client-inds">
                <div className="ind"><span className="ind-l">Caja</span><span className={`chip ${cash.kind}`}>{cash.label}</span></div>
                <div className="ind"><span className="ind-l">Runway</span><span className={`chip ${run.kind}`}>{c.runway.days >= 9999 ? '∞' : c.runway.days + 'd'}</span></div>
                <div className="ind"><span className="ind-l">Ventas</span><span className="ind-v">{c.sales.hasBudget ? `${c.sales.percentage}%` : '—'}</span></div>
                <div className="ind"><span className="ind-l">Vencido</span><span className="ind-v">{c.collection.totalOverdue > 0 ? cop(c.collection.totalOverdue) : '—'}</span></div>
                <div className="ind"><span className="ind-l">Alertas</span><span className="ind-v">{c.alerts.critical > 0 && <b className="crit">{c.alerts.critical}🔴</b>} {c.alerts.unread}</span></div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
