import { useRef, useState } from 'react';
import { api } from '../lib/api';
import './ScanInvoiceButton.css';

export interface ScannedInvoice {
  documentType: string;
  counterpartyName: string | null;
  counterpartyTaxId: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  category: string | null;
  description: string | null;
  earlyPaymentDiscountPct: number | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string | null;
}

/**
 * Toma una foto de la factura (o la sube desde galería), la manda al backend
 * para que Claude extraiga los datos, y devuelve los campos al formulario.
 * En móvil, `capture="environment"` abre directamente la cámara trasera.
 */
export function ScanInvoiceButton({
  kind,
  onScanned,
}: {
  kind: 'payable' | 'receivable';
  onScanned: (data: ScannedInvoice) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const data = await api<ScannedInvoice>('/scan/invoice', {
        method: 'POST',
        body: { image: dataUrl, kind },
      });
      onScanned(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer la factura');
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="scan-box">
      <button
        type="button"
        className="scan-btn"
        onClick={() => fileRef.current?.click()}
        disabled={loading}
      >
        {loading ? (
          <>
            <span className="spin" style={{ width: 16, height: 16, borderWidth: 2 }} />
            Leyendo la factura…
          </>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Escanear factura con la cámara
          </>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onFile}
      />
      {error && <div className="scan-err">{error}</div>}
      {!error && !loading && (
        <div className="scan-hint">Toma la foto y se llenan los campos solos.</div>
      )}
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}
