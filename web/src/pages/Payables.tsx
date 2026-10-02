import { type FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { cop, formatDate } from '../lib/format';
import { ScanInvoiceButton, type ScannedInvoice } from '../components/ScanInvoiceButton';
import './Pages.css';

interface Payable {
  id: string;
  supplier_name: string;
  amount: number;
  due_date: string;
  status: string;
  early_payment_discount_pct: number;
}

const STATUS: Record<string, { label: string; kind: string }> = {
  pending: { label: 'Pendiente', kind: 'info' },
  overdue: { label: 'Vencida', kind: 'bad' },
  paid: { label: 'Pagada', kind: 'ok' },
};

export function Payables() {
  const [items, setItems] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplierName, setSupplierName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [discount, setDiscount] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);

  /** Precarga el formulario con lo que se leyó de la foto. */
  function applyScan(d: ScannedInvoice) {
    if (d.counterpartyName) setSupplierName(d.counterpartyName);
    if (d.total != null) setAmount(String(d.total));
    if (d.dueDate) setDueDate(d.dueDate);
    if (d.earlyPaymentDiscountPct != null) setDiscount(String(d.earlyPaymentDiscountPct));

    // Si la lectura fue dudosa o faltan datos, se le dice al usuario qué revisar.
    const faltan: string[] = [];
    if (!d.counterpartyName) faltan.push('proveedor');
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
    const res = await api<Payable[]>('/payables');
    setItems(res);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null); setSaving(true);
    try {
      await api('/payables', { method: 'POST', body: {
        supplierName, amount: Number(amount), dueDate,
        earlyPaymentDiscountPct: discount ? Number(discount) : undefined,
      } });
      setToast('Cuenta por pagar agregada');
      setSupplierName(''); setAmount(''); setDueDate(''); setDiscount(''); setReview(null);
      await load();
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo agregar');
    } finally { setSaving(false); }
  }

  const totalOpen = items.filter((p) => p.status !== 'paid').reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="page">
      <h1>Por pagar</h1>
      <p className="sub">Cuentas con proveedores. Total abierto: <b>{cop(totalOpen)}</b></p>

      <div className="panel">
        <div className="card form-card">
          <h3>Nueva cuenta por pagar</h3>
          <ScanInvoiceButton kind="payable" onScanned={applyScan} />
          {review && <div className="scan-review">⚠ {review}</div>}
          {toast && <div className="toast">✓ {toast}</div>}
          {err && <div className="form-err">{err}</div>}
          <form onSubmit={submit}>
            <div className="field"><label>Proveedor</label>
              <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Proveedor López" required /></div>
            <div className="field"><label>Monto (COP)</label>
              <input type="number" inputMode="numeric" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="6000000" required /></div>
            <div className="row2">
              <div className="field"><label>Vence el</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required /></div>
              <div className="field"><label>Dto. pronto pago %</label>
                <input type="number" inputMode="numeric" min={0} max={100} value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="3" /></div>
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={saving}>Agregar</button>
          </form>
        </div>

        <div>
          <div className="list-head"><h3>Proveedores</h3><span className="list-count">{items.length}</span></div>
          {loading ? <div className="center" style={{ minHeight: 120 }}><div className="spin" /></div>
          : items.length === 0 ? <div className="card empty-list">Sin cuentas por pagar.</div>
          : items.map((p) => {
            const st = STATUS[p.status] ?? { label: p.status, kind: 'info' };
            return (
              <div key={p.id} className="item">
                <div className="grow">
                  <div className="t">{p.supplier_name}</div>
                  <div className="s">Vence {formatDate(p.due_date)}{p.early_payment_discount_pct > 0 ? ` · ${p.early_payment_discount_pct}% pronto pago` : ''}</div>
                </div>
                <span className={`chip ${st.kind}`} style={{ marginRight: 10 }}>{st.label}</span>
                <div className="amt">{cop(p.amount)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
