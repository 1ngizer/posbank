import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import './AlexaLinkCard.css';

interface Codigo {
  code: string;
  expiresAt: string;
  minutos: number;
}

/** mm:ss restantes, o null si ya venció. */
function restante(expiresAt: string): string | null {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Conecta el Alexa del usuario con su cuenta. Genera un código de 6 dígitos que
 * el usuario le dicta al skill; el código vence en 10 minutos.
 */
export function AlexaLinkCard() {
  const [codigo, setCodigo] = useState<Codigo | null>(null);
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reloj, setReloj] = useState<string | null>(null);

  // El contador se refresca cada segundo mientras haya código vivo.
  useEffect(() => {
    if (!codigo) return;
    const tick = () => {
      const r = restante(codigo.expiresAt);
      setReloj(r);
      if (!r) setCodigo(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [codigo]);

  async function generar() {
    setErr(null);
    setCargando(true);
    try {
      setCodigo(await api<Codigo>('/alexa/link-code', { method: 'POST' }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo generar el código');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="card alexa-card">
      <div className="alexa-head">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <div>
          <div className="alexa-t">Conectar Alexa</div>
          <div className="alexa-d">Pregúntale por tu caja sin abrir la app</div>
        </div>
      </div>

      {!codigo && (
        <>
          <p className="alexa-p">
            Genera un código y dícelo a tu Alexa. Solo se hace una vez.
          </p>
          <button className="btn btn-primary" onClick={generar} disabled={cargando}>
            {cargando ? 'Generando…' : 'Generar código'}
          </button>
        </>
      )}

      {codigo && (
        <>
          <div className="alexa-codigo" aria-label={`Código ${codigo.code.split('').join(' ')}`}>
            {codigo.code}
          </div>
          <p className="alexa-p">
            Dile a tu Alexa:<br />
            <b>«Alexa, abre posbank»</b><br />
            y luego <b>«vincula el código {codigo.code}»</b>
          </p>
          <div className="alexa-reloj">Vence en {reloj}</div>
          <button className="btn btn-ghost" onClick={generar} disabled={cargando}>
            Generar otro
          </button>
        </>
      )}

      {err && <div className="form-err">{err}</div>}
    </div>
  );
}
