import { type FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { cop, formatDate } from '../lib/format';
import './Pages.css';

interface Commitment {
  id: string; name: string; amount: number; frequency: string; next_due_date: string; is_active: boolean;
}
const FREQ: Record<string, string> = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual', quarterly: 'Trimestral' };

export function Commitments() {
  const [items, setItems] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [nextDueDate, setNextDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const res = await api<Commitment[]>('/commitments');
    setItems(res);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null); setSaving(true);
    try {
      await api('/commitments', { method: 'POST', body: { name, amount: Number(amount), frequency, nextDueDate } });
      setToast('Compromiso agregado');
      setName(''); setAmount(''); setNextDueDate('');
      await load();
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo agregar');
    } finally { setSaving(false); }
  }

  return (
    <div className="page">
      <h1>Compromisos fijos</h1>
      <p className="sub">Nómina, arriendo, servicios recurrentes. El radar los cuenta como pagos próximos.</p>

      <div className="panel">
        <div className="card form-card">
          <h3>Nuevo compromiso</h3>
          {toast && <div className="toast">✓ {toast}</div>}
          {err && <div className="form-err">{err}</div>}
          <form onSubmit={submit}>
            <div className="field"><label>Nombre</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nómina" required /></div>
            <div className="field"><label>Monto (COP)</label>
              <input type="number" inputMode="numeric" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="8000000" required /></div>
            <div className="row2">
              <div className="field"><label>Frecuencia</label>
                <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                  {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
              <div className="field"><label>Próximo vencimiento</label>
                <input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} required /></div>
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={saving}>Agregar</button>
          </form>
        </div>

        <div>
          <div className="list-head"><h3>Compromisos</h3><span className="list-count">{items.length}</span></div>
          {loading ? <div className="center" style={{ minHeight: 120 }}><div className="spin" /></div>
          : items.length === 0 ? <div className="card empty-list">Sin compromisos fijos.</div>
          : items.map((c) => (
            <div key={c.id} className="item">
              <div className="grow">
                <div className="t">{c.name}</div>
                <div className="s">{FREQ[c.frequency]} · próximo {formatDate(c.next_due_date)}</div>
              </div>
              <div className="amt">{cop(c.amount)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
