import { type FormEvent, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import './Login.css';

/** Logo oficial de Google (marca registrada — no recolorear). */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.2 5.6c4.2-3.9 6.6-9.6 6.6-16.4z"/>
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.2C1 16.3 0 20 0 24s1 7.7 2.6 10.8l7.9-6.2z"/>
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.6 2.2-8.7 2.2-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.2C6.5 42.6 14.6 48 24 48z"/>
    </svg>
  );
}

export function Login() {
  const { login, register, loginWithGoogle } = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // campos
  const [email, setEmail] = useState('demo@posbank.com');
  const [password, setPassword] = useState('Demo1234!');
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [reserve, setReserve] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else if (mode === 'register') {
        await register({
          companyName: companyName.trim(),
          name: name.trim(),
          email: email.trim(),
          password,
          minimumCashReserve: reserve ? Number(reserve) : undefined,
        });
      } else if (mode === 'forgot') {
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetErr) throw resetErr;
        setSuccess('Si tu correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo salió mal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <main className="login-card">
        <img className="login-logo" src="/brand/posbank-logo-wordmark.svg" alt="PosBank" />
        <p className="login-tag">Un banco en el punto de pago.</p>

        {mode !== 'forgot' ? (
          <div className="seg">
            <button className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setError(null); setSuccess(null); }} type="button">Entrar</button>
            <button className={mode === 'register' ? 'on' : ''} onClick={() => { setMode('register'); setError(null); setSuccess(null); }} type="button">Crear cuenta</button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <h2 style={{ fontSize: '1.1rem', margin: '0 0 6px', color: 'var(--text)' }}>Recuperar contraseña</h2>
            <p style={{ fontSize: '.84rem', color: 'var(--muted)', margin: 0 }}>
              Ingresa tu correo y te enviaremos un enlace seguro para restablecerla.
            </p>
          </div>
        )}

        <form onSubmit={submit}>
          {mode === 'register' && (
            <>
              <div className="field">
                <label htmlFor="companyName">Nombre de tu empresa</label>
                <input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Mi Pyme SAS" required />
              </div>
              <div className="field">
                <label htmlFor="ownerName">Tu nombre</label>
                <input id="ownerName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" required />
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="loginEmail">Correo</label>
            <input id="loginEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          {mode !== 'forgot' && (
            <div className="field">
              <label htmlFor="loginPassword">Contraseña</label>
              <input id="loginPassword" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              {mode === 'login' && (
                <div style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="login-forgot-link"
                    onClick={() => { setMode('forgot'); setError(null); setSuccess(null); }}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
              )}
            </div>
          )}

          {mode === 'register' && (
            <>
              <div className="field">
                <label htmlFor="minReserve">Reserva mínima de caja (opcional)</label>
                <input id="minReserve" type="number" inputMode="numeric" value={reserve} onChange={(e) => setReserve(e.target.value)} placeholder="5000000" min={0} />
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '.76rem', color: 'var(--muted)', margin: '10px 0 6px', cursor: 'pointer' }}>
                <input type="checkbox" required style={{ marginTop: 2 }} />
                <span>
                  Autorizo el tratamiento de mis datos personales conforme a la{' '}
                  <a href="https://posbank.ingizer.com/privacidad" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--navy)', textDecoration: 'underline' }}>
                    Política de Privacidad
                  </a>{' '}
                  (Ley 1581 de 2012).
                </span>
              </label>
            </>
          )}

          {error && <div className="login-error">{error}</div>}
          {success && <div className="login-success">{success}</div>}

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
            {loading ? <span className="spin" style={{ width: 18, height: 18, borderWidth: 2 }} /> : mode === 'login' ? 'Entrar' : mode === 'register' ? 'Crear cuenta' : 'Enviar enlace'}
          </button>

          {mode === 'forgot' && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button
                type="button"
                className="login-forgot-link"
                onClick={() => { setMode('login'); setError(null); setSuccess(null); }}
              >
                ← Volver a iniciar sesión
              </button>
            </div>
          )}
        </form>

        {mode !== 'forgot' && (
          <>
            <div className="or"><span>o</span></div>

            <button type="button" className="btn btn-google" disabled={googleLoading}
              onClick={async () => {
                setError(null); setGoogleLoading(true);
                try { await loginWithGoogle(); }
                catch (e) { setError(e instanceof Error ? e.message : 'Error con Google'); setGoogleLoading(false); }
              }}>
              <GoogleIcon />
              {googleLoading ? 'Conectando…' : 'Continuar con Google'}
            </button>

            {mode === 'login' && typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
              <p className="login-hint">Demo local: <b>demo@posbank.com</b> / <b>Demo1234!</b></p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
