import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AlexaLinkCard } from '../components/AlexaLinkCard';
import './Mas.css';

const LINKS = [
  { to: '/por-cobrar', label: 'Por cobrar', desc: 'Cartera de clientes', icon: 'M4 7l8 6 8-6M4 7h16v10H4z' },
  { to: '/por-pagar', label: 'Por pagar', desc: 'Proveedores', icon: 'M20 7l-8 6-8-6M4 7h16v10H4z' },
  { to: '/presupuesto', label: 'Presupuesto', desc: 'Metas y gastos del mes', icon: 'M4 5h16v14H4zM4 10h16M9 5v14' },
  { to: '/politicas', label: 'Políticas', desc: 'Cobro y pago', icon: 'M12 3l8 4v5c0 4-3 7-8 9-5-2-8-5-8-9V7z' },
  { to: '/compromisos', label: 'Compromisos', desc: 'Pagos fijos recurrentes', icon: 'M8 2v4M16 2v4M4 8h16M5 6h14v14H5z' },
];

export function Mas() {
  const { logout, profile } = useAuth();
  return (
    <div className="page">
      <h1>Ajustes</h1>
      <p className="sub">{profile?.email}</p>
      <div className="mas-grid">
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="mas-card card">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={l.icon} /></svg>
            <div>
              <div className="mas-t">{l.label}</div>
              <div className="mas-d">{l.desc}</div>
            </div>
          </Link>
        ))}
      </div>
      <AlexaLinkCard />
      <button className="btn btn-ghost" style={{ marginTop: 18 }} onClick={logout}>Cerrar sesión</button>
    </div>
  );
}
