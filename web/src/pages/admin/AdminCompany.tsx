import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { CashAnalysis } from '../../lib/types';
import { cop, copShort, stateChip, SEVERITY_COLOR } from '../../lib/format';
import { TrendChart, type TrendPoint } from '../../components/charts/TrendChart';
import './Admin.css';

interface Detail {
  company: { id: string; name: string; nit: string | null; industry: string | null; size: number | null };
  analysis: CashAnalysis;
  alerts: Array<{ id: string; severity: string; title: string; message: string; suggested_action: string | null; created_at: string }>;
  users: Array<{ name: string | null; email: string; role: string; phone_whatsapp: string | null }>;
  trend: TrendPoint[];
}

export function AdminCompany() {
  const { id } = useParams();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Detail>(`/admin/companies/${id}`).then(setD).catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <div className="card" style={{ color: 'var(--bad-ink)' }}>⚠ {err}</div>;
  if (!d) return <div className="center" style={{ minHeight: 300 }}><div className="spin" /></div>;

  const a = d.analysis;
  const runwayDays = a.runway.days >= 9999 ? '∞' : `${a.runway.days} días`;
  const scenarios = [
    { title: 'Posición de caja', state: a.cashPosition.state, sub: cop(a.cashPosition.totalAvailable) },
    { title: 'Ventas', state: a.sales.state, sub: a.flags.hasBudget ? `${a.sales.percentage}%` : 'sin ppto' },
    { title: 'Costos', state: a.costs.state, sub: a.flags.hasBudget ? `+${a.costs.overBudgetPct}%` : 'sin ppto' },
    { title: 'Cobro', state: a.collection.state, sub: a.collection.totalOverdue > 0 ? cop(a.collection.totalOverdue) : 'al día' },
    { title: 'Pago', state: a.payment.state, sub: a.payment.earlyPaymentOpportunities > 0 ? 'oportunidad' : 'al día' },
    { title: 'Runway', state: a.runway.state, sub: runwayDays },
  ];

  return (
    <div className="admin-page">
      <Link to="/" className="back-link">← Todos los clientes</Link>
      <div className="admin-head" style={{ marginTop: 8 }}>
        <div>
          <h1>{d.company.name}</h1>
          <p className="client-sub">{d.company.industry ?? 'Sin industria'} · {d.company.size ?? '?'} empleados · {d.company.nit ?? 'sin NIT'}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="ov-grid" style={{ marginBottom: 22 }}>
        <div className="ov card"><div className="ov-l">Efectivo</div><div className="ov-v num">{copShort(a.cashPosition.totalAvailable)}</div></div>
        <div className="ov card"><div className="ov-l">Runway</div><div className="ov-v num">{runwayDays}</div></div>
        <div className="ov card"><div className="ov-l">Por cobrar</div><div className="ov-v num">{copShort(a.cashPosition.totalReceivables)}</div></div>
        <div className="ov card"><div className="ov-l">Por pagar</div><div className="ov-v num">{copShort(a.cashPosition.totalPayables)}</div></div>
      </div>

      {/* Evolución */}
      <div className="card" style={{ marginBottom: 4 }}>
        <div className="chart-head"><h3>Evolución del flujo de caja</h3><span className="chart-sub">12 semanas · neto</span></div>
        <TrendChart data={d.trend} />
      </div>

      {/* Radar */}
      <h2 className="admin-h2">Radar</h2>
      <div className="radar-mini">
        {scenarios.map((s) => {
          const c = stateChip(s.state);
          return (
            <div key={s.title} className="rm card">
              <div className="rm-top"><span className="dot" style={{ background: c.dot }} />{s.title}</div>
              <div className="rm-bot"><span className="rm-sub">{s.sub}</span><span className={`chip ${c.kind}`}>{c.label}</span></div>
            </div>
          );
        })}
      </div>

      {/* Alertas + usuarios */}
      <div className="admin-2col">
        <div>
          <h2 className="admin-h2">Alertas recientes</h2>
          {d.alerts.length === 0 ? <div className="card empty-list">Sin alertas.</div>
          : d.alerts.slice(0, 8).map((al) => (
            <div key={al.id} className="alert card" style={{ borderLeft: `4px solid ${SEVERITY_COLOR[al.severity]}`, marginBottom: 8, padding: '12px 14px' }}>
              <div style={{ fontWeight: 600, fontSize: '.88rem', color: 'var(--navy)' }}>{al.title}</div>
              <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{al.message}</div>
            </div>
          ))}
        </div>
        <div>
          <h2 className="admin-h2">Usuarios</h2>
          {d.users.map((u, i) => (
            <div key={i} className="item">
              <div className="grow">
                <div className="t">{u.name ?? u.email}</div>
                <div className="s">{u.role} · {u.email}{u.phone_whatsapp ? ` · ${u.phone_whatsapp}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
