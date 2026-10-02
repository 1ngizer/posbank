import { type FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { cop, formatDate } from '../lib/format';
import { ScanInvoiceButton, type ScannedInvoice } from '../components/ScanInvoiceButton';
import './Pages.css';

interface Receivable {
  id: string;
  client_name: string;
  amount: number;
  due_date: string;
  status: string;
  days_overdue: number;
}

const STATUS: Record<string, { label: string; kind: string }> = {
  pending: { label: 'Pendiente', kind: 'info' },
  overdue: { label: 'Vencida', kind: 'bad' },
  partial: { label: 'Parcial', kind: 'warn' },
  paid: { label: 'Pagada', kind: 'ok' },
};

export function Receivables() {
  const [items, setItems] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientName, setClientName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);

  /** Precarga el formulario con lo que se leyó de la foto. */
  function applyScan(d: ScannedInvoice) {
    if (d.counterpartyName) setClientName(d.counterpartyName);
    if (d.total != null) setAmount(String(d.total));
    if (d.dueDate) setDueDate(d.dueDate);

    const faltan: string[] = [];
    if (!d.counterpartyName) faltan.push('cliente');
    if (d.total == null) faltan.push('monto');
    if (!d.dueDate) faltan.push('fecha de vencimiento');

    if (d.confidence === 'low') {
      setReview(`La foto no se leyó bien${d.notes ? `: ${d.notes}` : ''}. Revisa todos los campos antes de guardar.`);
    } else if (faltan.length > 0) {
      setReview(`Revisa y completa: ${faltan.join(', ')}.`);
    } else if (d.confidence === 'medium') {
      setReview('Verifica los datos antes de guardar.');
    } else {
      setReview(null);
    }
  }

  async function load() {
    const res = await api<Receivable[]>('/receivables');
    setItems(res);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null); setSaving(true);
    try {
      await api('/receivables', { method: 'POST', body: { clientName, amount: Number(amount), dueDate } });
      setToast('Cuenta por cobrar agregada');
      setClientName(''); setAmount(''); setDueDate(''); setReview(null);
      await load();
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo agregar');
    } finally { setSaving(false); }
  }

  const totalOpen = items.filter((r) => r.status !== 'paid').reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="page">
      <h1>Por cobrar</h1>
      <p className="sub">Cartera de clientes. Total abierto: <b>{cop(totalOpen)}</b></p>

      <div className="panel">
        <div className="card form-card">
          <h3>Nueva cuenta por cobrar</h3>
          <ScanInvoiceButton kind="receivable" onScanned={applyScan} />
          {review && <div className="scan-review">⚠ {review}</div>}
          {toast && <div className="toast">✓ {toast}</div>}
          {err && <div className="form-err">{err}</div>}
          <form onSubmit={submit}>
            <div className="field"><label>Cliente</label>
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Cliente ABC" required /></div>
            <div className="field"><label>Monto (COP)</label>
              <input type="number" inputMode="numeric" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5200000" required /></div>
            <div className="field"><label>Vence el</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required /></div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={saving}>Agregar</button>
          </form>
        </div>

        <div>
          <div className="list-head"><h3>Cartera</h3><span className="list-count">{items.length}</span></div>
          {loading ? <div className="center" style={{ minHeight: 120 }}><div className="spin" /></div>
          : items.length === 0 ? <div className="card empty-list">Sin cuentas por cobrar.</div>
          : items.map((r) => {
            const st = STATUS[r.status] ?? { label: r.status, kind: 'info' };
            return (
              <div key={r.id} className="item">
                <div className="grow">
                  <div className="t">{r.client_name}</div>
                  <div className="s">Vence {formatDate(r.due_date)}{r.days_overdue > 0 ? ` · ${r.days_overdue}d vencida` : ''}</div>
                </div>
                <span className={`chip ${st.kind}`} style={{ marginRight: 10 }}>{st.label}</span>
                <div className="amt">{cop(r.amount)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
