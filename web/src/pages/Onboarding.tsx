import { type FormEvent, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import './Login.css';

/**
 * Pantalla de bienvenida: quien entra con Google queda autenticado pero sin
 * empresa. Aquí la crea y ya entra a su radar.
 */
export function Onboarding() {
  const { completeOnboarding, logout, session } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [reserve, setReserve] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const email = session?.user?.email ?? '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await completeOnboarding(companyName.trim(), reserve ? Number(reserve) : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la empresa');
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img className="login-logo" src="/brand/posbank-logo-wordmark.svg" alt="PosBank" />
        <p className="login-tag">Bienvenido a PosBank</p>

        <p style={{ fontSize: '.86rem', color: 'var(--muted)', textAlign: 'center', marginBottom: 20 }}>
          Solo falta un dato para activar tu radar de caja.
        </p>

        <form onSubmit={submit}>
          <div className="field">
            <label>¿Cómo se llama tu empresa?</label>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Mi Pyme SAS" required minLength={2} autoFocus />
          </div>
          <div className="field">
            <label>Reserva mínima de caja (opcional)</label>
            <input type="number" min={0} value={reserve} onChange={(e) => setReserve(e.target.value)}
              placeholder="5000000" />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading || companyName.trim().length < 2}>
            {loading ? <span className="spin" style={{ width: 18, height: 18, borderWidth: 2 }} /> : 'Crear mi empresa'}
          </button>
        </form>

        <p className="login-hint">
          Conectado como <b>{email}</b> · <a href="#" onClick={(e) => { e.preventDefault(); logout(); }} style={{ color: 'var(--green-ink)', fontWeight: 600 }}>cambiar cuenta</a>
        </p>
      </div>
    </div>
  );
}
