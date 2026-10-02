import { type FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import './Pages.css';
import './Accounting.css';

interface ConnectionStatus {
  connected: boolean;
  provider: 'alegra' | 'siigo' | 'worldoffice' | null;
  status: string;
  lastSyncAt: string | null;
  emailMasked?: string;
}

interface SyncLog {
  id: string;
  provider: string;
  entity: string;
  local_id: string;
  external_id: string | null;
  status: 'pending' | 'synced' | 'failed';
  error: string | null;
  attempts: number;
  created_at: string;
}

export function Accounting() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Formulario Alegra
  const [selectedProvider, setSelectedProvider] = useState<'alegra' | 'siigo' | 'worldoffice'>('alegra');
  const [alegraEmail, setAlegraEmail] = useState('');
  const [alegraToken, setAlegraToken] = useState('');

  async function loadData() {
    try {
      const s = await api<ConnectionStatus>('/accounting/status').catch(() => null);
      setStatus(s);
      const l = await api<SyncLog[]>('/accounting/logs').catch(() => []);
      setLogs(l || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function handleConnect(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      if (selectedProvider === 'alegra') {
        if (!alegraEmail.trim() || !alegraToken.trim()) {
          throw new Error('Ingresa el correo y token de API de Alegra');
        }
        await api('/accounting/connect', {
          method: 'POST',
          body: {
            provider: 'alegra',
            credentials: {
              email: alegraEmail.trim(),
              token: alegraToken.trim(),
            },
          },
        });
        flash('¡Conectado exitosamente con Alegra!');
        setAlegraEmail('');
        setAlegraToken('');
        await loadData();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al conectar');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setErrorMsg(null);
    try {
      const res = await api<{ ok: boolean; message: string }>('/accounting/test', {
        method: 'POST',
      });
      if (res.ok) {
        flash(res.message || 'Conexión verificada');
      } else {
        setErrorMsg(res.message || 'Error en la conexión');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Fallo al probar conexión');
    } finally {
      setTesting(false);
    }
  }

  async function handleDisconnect() {
    if (!status?.provider) return;
    if (!confirm('¿Deseas desconectar este software contable? Se detendrán las sincronizaciones automáticas.')) return;

    setSubmitting(true);
    try {
      await api('/accounting/disconnect', {
        method: 'POST',
        body: { provider: status.provider },
      });
      flash('Software contable desconectado');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al desconectar');
    } finally {
      setSubmitting(false);
    }
  }

  function getEntityLabel(entity: string) {
    switch (entity) {
      case 'invoice': return 'Factura POS';
      case 'receivable': return 'Por cobrar';
      case 'payable': return 'Por pagar';
      case 'cash_movement': return 'Movimiento';
      default: return entity;
    }
  }

  if (loading) {
    return <div className="center" style={{ minHeight: 250 }}><div className="spin" /></div>;
  }

  return (
    <div className="page">
      <h1>Integración Contable</h1>
      <p className="sub">
        Conecta PosBank a tu software contable para sincronizar facturas, cartera y movimientos de caja en segundo plano.
      </p>

      {toast && <div className="toast" style={{ maxWidth: 460 }}>✓ {toast}</div>}
      {errorMsg && (
        <div className="toast" style={{ maxWidth: 460, background: '#ef4444', color: '#fff' }}>
          ✕ {errorMsg}
        </div>
      )}

      {status?.connected ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="status-box connected">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="badge-tag badge-active">Conectado</span>
                <strong style={{ fontSize: '1.05rem', textTransform: 'capitalize' }}>{status.provider}</strong>
              </div>
              {status.emailMasked && (
                <p style={{ margin: '4px 0', fontSize: '.88rem', color: 'var(--muted)' }}>
                  Cuenta: {status.emailMasked}
                </p>
              )}
              <p style={{ margin: '4px 0', fontSize: '.84rem', color: 'var(--muted)' }}>
                Última sincronización: {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString('es-CO') : 'Pendiente del primer registro'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-secondary"
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? 'Probando...' : 'Probar conexión'}
              </button>
              <button
                className="btn btn-ghost"
                onClick={handleDisconnect}
                disabled={submitting}
                style={{ color: '#ef4444' }}
              >
                Desconectar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="card form-card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Elige tu proveedor contable</h3>
          <div className="accounting-grid">
            <div
              className={`provider-card ${selectedProvider === 'alegra' ? 'active' : ''}`}
              onClick={() => setSelectedProvider('alegra')}
            >
              <h4>Alegra</h4>
              <p>Facturación, inventarios y contabilidad en la nube.</p>
              <span className="badge-tag badge-active">Disponible</span>
            </div>

            <div
              className="provider-card disabled"
              title="Próximamente disponible"
            >
              <h4>Siigo Nube</h4>
              <p>Conexión directa vía OAuth2 y catálogo Siigo API.</p>
              <span className="badge-tag badge-soon">Próximamente</span>
            </div>

            <div
              className="provider-card disabled"
              title="Próximamente disponible"
            >
              <h4>World Office</h4>
              <p>Integración contable empresarial vía Token API.</p>
              <span className="badge-tag badge-soon">Próximamente</span>
            </div>
          </div>

          {selectedProvider === 'alegra' && (
            <form onSubmit={handleConnect}>
              <h4 style={{ marginBottom: 14 }}>Credenciales de Alegra</h4>
              <div className="field">
                <label>Correo electrónico de tu cuenta Alegra</label>
                <input
                  type="email"
                  required
                  placeholder="usuario@tuempresa.com"
                  value={alegraEmail}
                  onChange={(e) => setAlegraEmail(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Token de API (Alegra)</label>
                <input
                  type="password"
                  required
                  placeholder="Token de acceso API"
                  value={alegraToken}
                  onChange={(e) => setAlegraToken(e.target.value)}
                />
                <small style={{ color: 'var(--muted)', display: 'block', marginTop: 4 }}>
                  Obtén tu token en Alegra: <em>Configuración → Integraciones → API</em>. Nunca guardamos credenciales en texto plano.
                </small>
              </div>

              <button
                className="btn btn-primary"
                type="submit"
                disabled={submitting}
                style={{ marginTop: 12, width: '100%' }}
              >
                {submitting ? 'Verificando con Alegra...' : 'Conectar y Activar Sincronización'}
              </button>
            </form>
          )}
        </div>
      )}

      <div className="card">
        <h3>Historial de sincronización</h3>
        <p className="sub" style={{ fontSize: '.84rem', margin: '4px 0 12px 0' }}>
          Registro de auditoría e idempotencia de facturas, cartera y pagos enviados al software contable.
        </p>

        {logs.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontStyle: 'italic', margin: '14px 0' }}>
            No hay registros de sincronización aún.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sync-table">
              <thead>
                <tr>
                  <th>Entidad</th>
                  <th>ID Externo</th>
                  <th>Estado</th>
                  <th>Reintentos</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <strong>{getEntityLabel(log.entity)}</strong>
                    </td>
                    <td>{log.external_id || '—'}</td>
                    <td>
                      <span className={`sync-pill ${log.status}`}>
                        {log.status === 'synced' ? 'Sincronizado' : log.status === 'pending' ? 'Pendiente' : 'Fallido'}
                      </span>
                      {log.error && (
                        <div style={{ fontSize: '.75rem', color: '#ef4444', marginTop: 3 }}>
                          {log.error}
                        </div>
                      )}
                    </td>
                    <td>{log.attempts}</td>
                    <td>{new Date(log.created_at).toLocaleString('es-CO')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
