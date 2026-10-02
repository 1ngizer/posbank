import { type FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { cop, formatDate } from '../lib/format';
import './Pages.css';

interface Movement {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string | null;
  date: string;
  source_channel: string;
}

const CATEGORIES = ['sales', 'payroll', 'suppliers', 'taxes', 'rent', 'utilities', 'other'];
const CAT_LABEL: Record<string, string> = {
  sales: 'Ventas', payroll: 'Nómina', suppliers: 'Proveedores', taxes: 'Impuestos',
  rent: 'Arriendo', utilities: 'Servicios', other: 'Otro',
};

export function Movements() {
  const [items, setItems] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('sales');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const res = await api<{ items: Movement[] }>('/movements?limit=50');
    setItems(res.items);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null); setSaving(true);
    try {
      await api('/movements', { method: 'POST', body: {
        type, amount: Number(amount), category, description: description || undefined,
      } });
      setToast(`${type === 'income' ? 'Ingreso' : 'Egreso'} de ${cop(Number(amount))} registrado`);
      setAmount(''); setDescription('');
      await load();
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo registrar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <h1>Movimientos</h1>
      <p className="sub">Registra tus ingresos y egresos de efectivo.</p>

      <div className="panel">
        {/* Form */}
        <div className="card form-card">
          <h3>Registrar movimiento</h3>
          {toast && <div className="toast">✓ {toast}</div>}
          {err && <div className="form-err">{err}</div>}
          <form onSubmit={submit}>
            <div className="seg" style={{ marginBottom: 14 }}>
              <button type="button" className={type === 'income' ? 'on' : ''} onClick={() => setType('income')}>Ingreso</button>
              <button type="button" className={type === 'expense' ? 'on' : ''} onClick={() => setType('expense')}>Egreso</button>
            </div>
            <div className="field">
              <label>Monto (COP)</label>
              <input type="number" inputMode="numeric" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500000" required />
            </div>
            <div className="field">
              <label>Categoría</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Descripción (opcional)</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Venta mostrador" />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={saving || !amount}>
              {saving ? 'Guardando…' : 'Registrar'}
            </button>
          </form>
        </div>

        {/* List */}
        <div>
          <div className="list-head">
            <h3>Últimos movimientos</h3>
            <span className="list-count">{items.length}</span>
          </div>
          {loading ? <div className="center" style={{ minHeight: 120 }}><div className="spin" /></div>
          : items.length === 0 ? <div className="card empty-list">Aún no hay movimientos.</div>
          : items.map((m) => (
            <div key={m.id} className="item">
              <div className={`ic ${m.type === 'income' ? 'in' : 'out'}`}>{m.type === 'income' ? '+' : '−'}</div>
              <div className="grow">
                <div className="t">{m.description || CAT_LABEL[m.category]}</div>
                <div className="s">{CAT_LABEL[m.category]} · {formatDate(m.date)} · {m.source_channel}</div>
              </div>
              <div className={`amt ${m.type === 'income' ? 'in' : 'out'}`}>
                {m.type === 'income' ? '+' : '−'}{cop(m.amount)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
