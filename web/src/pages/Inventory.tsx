import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { uploadProductPhoto } from '../lib/storage';
import { useAuth } from '../auth/AuthContext';
import { cop } from '../lib/format';
import './Inventory.css';

interface Product {
  id: string;
  name: string;
  category: 'raw' | 'wip' | 'finished';
  photo_url: string | null;
  unit: string;
  cost: number;
  price: number;
  tax_rate: number;
  stock: number;
}

const CATS = [
  { key: 'all', label: 'Todos' },
  { key: 'finished', label: 'Terminado' },
  { key: 'wip', label: 'En proceso' },
  { key: 'raw', label: 'Materia prima' },
] as const;
const CAT_LABEL: Record<string, string> = { raw: 'Materia prima', wip: 'En proceso', finished: 'Terminado' };
const CAT_KIND: Record<string, string> = { raw: 'warn', wip: 'info', finished: 'ok' };

export function Inventory() {
  const { profile } = useAuth();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // form
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'raw' | 'wip' | 'finished'>('finished');
  const [unit, setUnit] = useState('unidad');
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [taxRate, setTaxRate] = useState('19');
  const [stock, setStock] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const res = await api<Product[]>('/products');
    setItems(res);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploading(true); setErr(null);
    try {
      const url = await uploadProductPhoto(profile.companyId, file);
      setPhotoUrl(url);
    } catch (er) {
      setErr(er instanceof Error ? er.message : 'No se pudo subir la foto');
    } finally { setUploading(false); }
  }

  function resetForm() {
    setName(''); setCategory('finished'); setUnit('unidad'); setCost('');
    setPrice(''); setTaxRate('19'); setStock(''); setPhotoUrl(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null); setSaving(true);
    try {
      await api('/products', { method: 'POST', body: {
        name, category, unit,
        cost: cost ? Number(cost) : 0,
        price: price ? Number(price) : 0,
        taxRate: taxRate ? Number(taxRate) : 0,
        stock: stock ? Number(stock) : 0,
        photoUrl: photoUrl ?? undefined,
      } });
      resetForm(); setShowForm(false);
      await load();
    } catch (er) {
      setErr(er instanceof Error ? er.message : 'No se pudo guardar');
    } finally { setSaving(false); }
  }

  async function adjustStock(p: Product, delta: number) {
    await api(`/products/${p.id}/stock`, { method: 'POST', body: { quantity: delta, type: delta > 0 ? 'in' : 'out' } });
    await load();
  }

  const shown = filter === 'all' ? items : items.filter((p) => p.category === filter);

  return (
    <div className="page">
      <div className="inv-head">
        <div>
          <h1>Inventario</h1>
          <p className="sub">Materias primas, en proceso y producto terminado.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cerrar' : '+ Producto'}
        </button>
      </div>

      {showForm && (
        <div className="card form-card" style={{ marginBottom: 18 }}>
          {err && <div className="form-err">{err}</div>}
          <form onSubmit={submit}>
            <div className="inv-form-grid">
              <label className="photo-drop" onClick={() => fileRef.current?.click()}>
                {photoUrl ? <img src={photoUrl} alt="" /> : <span>{uploading ? 'Subiendo…' : '+ Foto'}</span>}
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
              </label>
              <div style={{ flex: 1 }}>
                <div className="field"><label>Nombre</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Camiseta talla M" required /></div>
                <div className="row2">
                  <div className="field"><label>Categoría</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value as any)}>
                      <option value="finished">Terminado</option>
                      <option value="wip">En proceso</option>
                      <option value="raw">Materia prima</option>
                    </select></div>
                  <div className="field"><label>Unidad</label>
                    <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unidad / kg / litro" /></div>
                </div>
              </div>
            </div>
            <div className="row2">
              <div className="field"><label>Costo (COP)</label>
                <input type="number" inputMode="numeric" min={0} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" /></div>
              <div className="field"><label>Stock inicial</label>
                <input type="number" inputMode="numeric" min={0} value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" /></div>
            </div>
            {category === 'finished' && (
              <div className="row2">
                <div className="field"><label>Precio de venta (COP)</label>
                  <input type="number" inputMode="numeric" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" /></div>
                <div className="field"><label>IVA %</label>
                  <select value={taxRate} onChange={(e) => setTaxRate(e.target.value)}>
                    <option value="0">0% (exento)</option>
                    <option value="5">5%</option>
                    <option value="19">19%</option>
                  </select></div>
              </div>
            )}
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={saving || uploading || !name}>
              {saving ? 'Guardando…' : 'Guardar producto'}
            </button>
          </form>
        </div>
      )}

      <div className="inv-tabs">
        {CATS.map((c) => (
          <button key={c.key} className={filter === c.key ? 'on' : ''} onClick={() => setFilter(c.key)}>{c.label}</button>
        ))}
      </div>

      {loading ? <div className="center" style={{ minHeight: 140 }}><div className="spin" /></div>
      : shown.length === 0 ? <div className="card empty-list">No hay productos en esta categoría.</div>
      : (
        <div className="prod-grid">
          {shown.map((p) => (
            <div key={p.id} className="prod card">
              <div className="prod-photo">
                {p.photo_url ? <img src={p.photo_url} alt={p.name} /> : <span className="ph">Sin foto</span>}
                <span className={`chip ${CAT_KIND[p.category]}`}>{CAT_LABEL[p.category]}</span>
              </div>
              <div className="prod-body">
                <div className="prod-name">{p.name}</div>
                {p.category === 'finished' && <div className="prod-price">{cop(p.price)} <small>+{p.tax_rate}% IVA</small></div>}
                <div className="prod-stock">
                  <button onClick={() => adjustStock(p, -1)} aria-label="restar">−</button>
                  <span className="num"><b>{Number(p.stock)}</b> {p.unit}</span>
                  <button onClick={() => adjustStock(p, 1)} aria-label="sumar">+</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
