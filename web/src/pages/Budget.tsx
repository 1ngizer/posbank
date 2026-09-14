import { type FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { cop } from '../lib/format';
import './Pages.css';

interface Budget {
  id: string; month: number; year: number;
  revenue_budget: number; cost_budget: number; expense_budget: number; sales_target: number;
}
const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function Budget() {
  const now = new Date();
  const [items, setItems] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [salesTarget, setSalesTarget] = useState('');
  const [costBudget, setCostBudget] = useState('');
  const [expenseBudget, setExpenseBudget] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const res = await api<Budget[]>('/budgets');
    setItems(res);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null); setSaving(true);
    try {
      await api('/budgets', { method: 'POST', body: {
        month, year,
        salesTarget: Number(salesTarget) || 0,
        revenueBudget: Number(salesTarget) || 0,
        costBudget: Number(costBudget) || 0,
        expenseBudget: Number(expenseBudget) || 0,
      } });
      setToast('Presupuesto guardado');
      await load();
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally { setSaving(false); }
  }

  return (
    <div className="page">
      <h1>Presupuesto</h1>
      <p className="sub">Define tu meta de ventas y presupuesto de gastos por mes. Alimenta el radar.</p>

      <div className="panel">
        <div className="card form-card">
          <h3>Presupuesto del mes</h3>
          {toast && <div className="toast">✓ {toast}</div>}
          {err && <div className="form-err">{err}</div>}
          <form onSubmit={submit}>
            <div className="row2">
              <div className="field"><label>Mes</label>
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                  {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select></div>
              <div className="field"><label>Año</label>
                <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div>
            </div>
            <div className="field"><label>Meta de ventas (COP)</label>
              <input type="number" min={0} value={salesTarget} onChange={(e) => setSalesTarget(e.target.value)} placeholder="40000000" required /></div>
            <div className="row2">
              <div className="field"><label>Presupuesto de costos</label>
                <input type="number" min={0} value={costBudget} onChange={(e) => setCostBudget(e.target.value)} placeholder="8000000" /></div>
              <div className="field"><label>Presupuesto de gastos</label>
                <input type="number" min={0} value={expenseBudget} onChange={(e) => setExpenseBudget(e.target.value)} placeholder="4000000" /></div>
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={saving}>Guardar</button>
          </form>
        </div>

        <div>
          <div className="list-head"><h3>Historial</h3><span className="list-count">{items.length}</span></div>
          {loading ? <div className="center" style={{ minHeight: 120 }}><div className="spin" /></div>
          : items.length === 0 ? <div className="card empty-list">Sin presupuestos aún.</div>
          : items.map((b) => (
            <div key={b.id} className="item">
              <div className="grow">
                <div className="t">{MESES[b.month]} {b.year}</div>
                <div className="s">Costos {cop(b.cost_budget)} · Gastos {cop(b.expense_budget)}</div>
              </div>
              <div className="amt">{cop(b.sales_target)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
