import { type FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import './Pages.css';

export function Policies() {
  const [collMax, setCollMax] = useState('30');
  const [collGrace, setCollGrace] = useState('0');
  const [collReminder, setCollReminder] = useState(true);
  const [payStd, setPayStd] = useState('30');
  const [payEarly, setPayEarly] = useState('10');
  const [payDisc, setPayDisc] = useState('2');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const c = await api<any>('/policies/collection').catch(() => null);
      const p = await api<any>('/policies/payment').catch(() => null);
      if (c) { setCollMax(String(c.max_days)); setCollGrace(String(c.grace_period_days)); setCollReminder(c.auto_reminder_enabled); }
      if (p) { setPayStd(String(p.standard_payment_days)); setPayEarly(String(p.early_payment_threshold_days)); setPayDisc(String(p.early_payment_discount_min_pct)); }
      setLoading(false);
    })();
  }, []);

  async function saveColl(e: FormEvent) {
    e.preventDefault();
    await api('/policies/collection', { method: 'POST', body: {
      maxDays: Number(collMax), gracePeriodDays: Number(collGrace), autoReminderEnabled: collReminder,
    } });
    flash('Política de cobro guardada');
  }
  async function savePay(e: FormEvent) {
    e.preventDefault();
    await api('/policies/payment', { method: 'POST', body: {
      standardPaymentDays: Number(payStd), earlyPaymentThresholdDays: Number(payEarly), earlyPaymentDiscountMinPct: Number(payDisc),
    } });
    flash('Política de pago guardada');
  }
  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 3000); }

  if (loading) return <div className="center" style={{ minHeight: 200 }}><div className="spin" /></div>;

  return (
    <div className="page">
      <h1>Políticas</h1>
      <p className="sub">Cobro y pago. Definirlas quita las alertas de "Configurar" del radar.</p>
      {toast && <div className="toast" style={{ maxWidth: 420 }}>✓ {toast}</div>}

      <div className="panel">
        <form className="card form-card" onSubmit={saveColl}>
          <h3>Política de cobro</h3>
          <div className="field"><label>Plazo máximo de cobro (días)</label>
            <input type="number" min={0} value={collMax} onChange={(e) => setCollMax(e.target.value)} /></div>
          <div className="field"><label>Días de gracia</label>
            <input type="number" min={0} value={collGrace} onChange={(e) => setCollGrace(e.target.value)} /></div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.86rem', marginBottom: 14 }}>
            <input type="checkbox" checked={collReminder} onChange={(e) => setCollReminder(e.target.checked)} /> Recordatorios automáticos
          </label>
          <button className="btn btn-primary" style={{ width: '100%' }}>Guardar cobro</button>
        </form>

        <form className="card form-card" onSubmit={savePay}>
          <h3>Política de pago</h3>
          <div className="field"><label>Plazo estándar de pago (días)</label>
            <input type="number" min={0} value={payStd} onChange={(e) => setPayStd(e.target.value)} /></div>
          <div className="field"><label>Umbral de pronto pago (días)</label>
            <input type="number" min={0} value={payEarly} onChange={(e) => setPayEarly(e.target.value)} /></div>
          <div className="field"><label>Descuento mínimo por pronto pago (%)</label>
            <input type="number" min={0} max={100} value={payDisc} onChange={(e) => setPayDisc(e.target.value)} /></div>
          <button className="btn btn-primary" style={{ width: '100%' }}>Guardar pago</button>
        </form>
      </div>
    </div>
  );
}
