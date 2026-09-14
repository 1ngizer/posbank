import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { cop } from '../lib/format';
import './Pos.css';

interface Product {
  id: string; name: string; photo_url: string | null;
  price: number; tax_rate: number; stock: number; unit: string;
}
interface CartLine { product: Product; qty: number }

export function Pos() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [customer, setCustomer] = useState('');
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const res = await api<Product[]>('/products?category=finished');
    setProducts(res);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function add(p: Product) {
    setDone(null);
    setCart((c) => {
      const cur = c[p.id]?.qty ?? 0;
      if (cur + 1 > Number(p.stock)) return c; // no exceder stock
      return { ...c, [p.id]: { product: p, qty: cur + 1 } };
    });
  }
  function setQty(id: string, qty: number) {
    setCart((c) => {
      if (qty <= 0) { const { [id]: _, ...rest } = c; return rest; }
      const line = c[id];
      const q = Math.min(qty, Number(line.product.stock));
      return { ...c, [id]: { ...line, qty: q } };
    });
  }

  const lines = Object.values(cart);
  const { subtotal, tax, total } = useMemo(() => {
    let s = 0, t = 0;
    for (const l of lines) {
      const lt = l.product.price * l.qty;
      s += lt; t += (lt * l.product.tax_rate) / 100;
    }
    return { subtotal: s, tax: t, total: s + t };
  }, [lines]);

  async function issue() {
    if (lines.length === 0) return;
    setIssuing(true); setErr(null);
    try {
      const inv = await api<{ number: string }>('/invoices', {
        method: 'POST',
        body: { customerName: customer || undefined, items: lines.map((l) => ({ productId: l.product.id, quantity: l.qty })) },
      });
      setDone(inv.number);
      setCart({}); setCustomer('');
      await load(); // refresca stock
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo emitir la factura');
    } finally { setIssuing(false); }
  }

  return (
    <div className="page pos">
      <h1>Facturación POS</h1>
      <p className="sub">Vende tu producto terminado. Cada factura entra a la caja automáticamente.</p>

      <div className="pos-grid">
        {/* Productos */}
        <div>
          {loading ? <div className="center" style={{ minHeight: 140 }}><div className="spin" /></div>
          : products.length === 0 ? (
            <div className="card empty-list">No hay producto terminado. Agrégalo en <b>Inventario</b>.</div>
          ) : (
            <div className="pos-products">
              {products.map((p) => {
                const inCart = cart[p.id]?.qty ?? 0;
                const soldOut = Number(p.stock) <= 0;
                return (
                  <button key={p.id} className={`pos-prod ${soldOut ? 'out' : ''}`} onClick={() => !soldOut && add(p)} disabled={soldOut}>
                    <div className="pp-photo">{p.photo_url ? <img src={p.photo_url} alt="" /> : <span>—</span>}</div>
                    <div className="pp-name">{p.name}</div>
                    <div className="pp-price">{cop(p.price)}</div>
                    <div className="pp-stock">{soldOut ? 'Agotado' : `${Number(p.stock)} disp.`}{inCart > 0 && <b> · {inCart} en carrito</b>}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Carrito */}
        <div className="pos-cart card">
          <h3>Factura</h3>
          {done && <div className="toast">✓ Factura {done} emitida. Ingreso registrado en caja.</div>}
          {err && <div className="form-err">{err}</div>}

          {lines.length === 0 ? (
            <div className="cart-empty">Toca un producto para agregarlo.</div>
          ) : (
            <div className="cart-lines">
              {lines.map((l) => (
                <div key={l.product.id} className="cart-line">
                  <div className="cl-grow">
                    <div className="cl-name">{l.product.name}</div>
                    <div className="cl-sub">{cop(l.product.price)} · {l.product.tax_rate}% IVA</div>
                  </div>
                  <div className="cl-qty">
                    <button onClick={() => setQty(l.product.id, l.qty - 1)}>−</button>
                    <span>{l.qty}</span>
                    <button onClick={() => setQty(l.product.id, l.qty + 1)}>+</button>
                  </div>
                  <div className="cl-total num">{cop(l.product.price * l.qty)}</div>
                </div>
              ))}
            </div>
          )}

          <div className="field" style={{ marginTop: 12 }}>
            <label>Cliente (opcional)</label>
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Cliente mostrador" />
          </div>

          <div className="totals">
            <div><span>Subtotal</span><span className="num">{cop(subtotal)}</span></div>
            <div><span>IVA</span><span className="num">{cop(tax)}</span></div>
            <div className="grand"><span>Total</span><span className="num">{cop(total)}</span></div>
          </div>

          <button className="btn btn-primary" style={{ width: '100%' }} disabled={issuing || lines.length === 0} onClick={issue}>
            {issuing ? 'Emitiendo…' : `Emitir factura · ${cop(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
