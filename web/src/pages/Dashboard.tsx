import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import type { DashboardData } from '../lib/types';
import { cop, copShort, stateChip, SEVERITY_COLOR } from '../lib/format';
import './Dashboard.css';

export function Dashboard() {
  const { profile } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<DashboardData>('/dashboard');
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Tiempo real: refresca (con debounce) cuando cambian datos de la empresa ──
  useEffect(() => {
    if (!profile?.companyId) return;
    const refresh = () => {
      setLive(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { load(); setTimeout(() => setLive(false), 1200); }, 600);
    };
    const filter = `company_id=eq.${profile.companyId}`;
    const ch = supabase
      .channel('posbank-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_movements', filter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts', filter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receivables', filter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payables', filter }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.companyId, load]);

  if (error) return <div className="card" style={{ color: 'var(--bad-ink)' }}>⚠ {error}</div>;
  if (!data) return <div className="center" style={{ minHeight: 300 }}><div className="spin" /></div>;

  const a = data.analysis;
  const runwayDays = a.runway.days >= 9999 ? '∞' : `${a.runway.days} días`;

  const scenarios = [
    { title: 'Posición de caja', state: a.cashPosition.state, sub: cop(a.cashPosition.totalAvailable) + ' disponible' },
    { title: 'Cumplimiento de ventas', state: a.sales.state, sub: a.flags.hasBudget ? `${a.sales.percentage}% de la meta` : 'sin presupuesto' },
    { title: 'Costos y gastos', state: a.costs.state, sub: a.flags.hasBudget ? `+${a.costs.overBudgetPct}% sobre ppto` : 'sin presupuesto' },
    { title: 'Política de cobro', state: a.collection.state, sub: a.collection.totalOverdue > 0 ? cop(a.collection.totalOverdue) + ' vencido' : 'sin cartera vencida' },
    { title: 'Política de pago', state: a.payment.state, sub: a.payment.earlyPaymentOpportunities > 0 ? 'ahorro ' + cop(a.payment.earlyPaymentOpportunities) : 'al día' },
    { title: 'Runway', state: a.runway.state, sub: runwayDays + ' de operación' },
  ];

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <div className="eyebrow">Radar de caja</div>
          <h1>Tu caja hoy</h1>
        </div>
        {live && <span className="live-dot">● actualizando…</span>}
      </div>

      {/* KPIs */}
      <div className="kpis">
        <div className="kpi-main card">
          <div className="kpi-label">Efectivo disponible</div>
          <div className="kpi-value num">{cop(a.cashPosition.totalAvailable)}</div>
          <div className="spectrum" style={{ margin: '14px 0 6px' }} />
          <div className="scale"><span>Alerta</span><span>Gestión</span></div>
        </div>
        <div className="kpi-side">
          <div className="mini card">
            <div className="kpi-label">Runway</div>
            <div className="mini-val num">{runwayDays}</div>
            {(() => { const c = stateChip(a.runway.state); return <span className={`chip ${c.kind}`}>{c.label}</span>; })()}
          </div>
          <div className="mini card">
            <div className="kpi-label">Posición neta</div>
            <div className="mini-val num" style={{ fontSize: '1.15rem' }}>{copShort(a.cashPosition.netPosition)}</div>
            <div className="mini-sub">+ por cobrar − por pagar</div>
          </div>
        </div>
      </div>

      {/* Radar */}
      <h2 className="sec-h">Seis frentes de tu caja</h2>
      <div className="radar">
        {scenarios.map((s) => {
          const c = stateChip(s.state);
          return (
            <div key={s.title} className="scn card">
              <div className="scn-top">
                <span className="dot" style={{ background: c.dot }} />
                <span className="scn-title">{s.title}</span>
              </div>
              <div className="scn-bottom">
                <span className="scn-sub">{s.sub}</span>
                <span className={`chip ${c.kind}`}>{c.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Alertas */}
      <h2 className="sec-h">Alertas
        {data.alerts.unreadCount > 0 && <span className="badge">{data.alerts.unreadCount}</span>}
      </h2>
      {data.alerts.recent.length === 0 ? (
        <div className="card empty">Sin alertas por ahora. Todo en orden. 👌</div>
      ) : (
        <div className="alerts">
          {data.alerts.recent.map((al) => (
            <div key={al.id} className="alert card" style={{ borderLeftColor: SEVERITY_COLOR[al.severity] }}>
              <div className="alert-t"><span className="dot" style={{ background: SEVERITY_COLOR[al.severity] }} />{al.title}</div>
              <div className="alert-m">{al.message}</div>
              {al.suggested_action && <div className="alert-a">→ {al.suggested_action}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
