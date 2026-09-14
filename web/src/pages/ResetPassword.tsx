import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './Login.css';

export function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess(true);
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img className="login-logo" src="/brand/posbank-logo-wordmark.svg" alt="PosBank" />
        <p className="login-tag">Un banco en el punto de pago.</p>

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.15rem', margin: '0 0 6px', color: 'var(--text)' }}>Nueva contraseña</h2>
          <p style={{ fontSize: '.84rem', color: 'var(--muted)', margin: 0 }}>
            Escribe tu nueva contraseña para volver a ingresar a PosBank.
          </p>
        </div>

        {success ? (
          <div className="login-success" style={{ padding: '16px 12px' }}>
            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>¡Contraseña actualizada!</p>
            <p style={{ margin: 0, fontSize: '.82rem' }}>Redirigiéndote al inicio de sesión...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Nueva contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                minLength={8}
              />
            </div>

            <div className="field">
              <label>Confirmar nueva contraseña</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la contraseña"
                required
                minLength={8}
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 8 }}
              disabled={loading}
            >
              {loading ? <span className="spin" style={{ width: 18, height: 18, borderWidth: 2 }} /> : 'Guardar nueva contraseña'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button
                type="button"
                className="login-forgot-link"
                onClick={() => navigate('/login')}
              >
                ← Volver a inicio de sesión
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
