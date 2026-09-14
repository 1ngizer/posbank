import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import './AppShell.css';

const IC = {
  radar: 'M3 12h4l3 8 4-16 3 8h4',
  pos: 'M3 3h2l.4 2M7 13h10l3-8H6.4M7 13L5.4 5M7 13l-2 4h12M9 21a1 1 0 100-2 1 1 0 000 2zM17 21a1 1 0 100-2 1 1 0 000 2z',
  inv: 'M20 7l-8-4-8 4v10l8 4 8-4zM4 7l8 4 8-4M12 21V11',
  mov: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  cobrar: 'M4 7l8 6 8-6M4 7h16v10H4z',
  pagar: 'M20 7l-8 6-8-6M4 7h16v10H4z',
  budget: 'M4 5h16v14H4zM4 10h16M9 5v14',
  pol: 'M12 3l8 4v5c0 4-3 7-8 9-5-2-8-5-8-9V7z',
  com: 'M8 2v4M16 2v4M4 8h16M5 6h14v14H5z',
  mas: 'M4 12h16M12 4v16',
  ajustes: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.7 1.7 0 008 19.4a1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H2a2 2 0 110-4h.1A1.7 1.7 0 004.6 8a1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H10a1.7 1.7 0 001-1.5V2a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V10a1.7 1.7 0 001.5 1H22a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
};

// Sidebar (desktop): agrupado y completo.
const GROUPS = [
  { title: 'Operación', items: [
    { to: '/', label: 'Radar', end: true, icon: IC.radar },
    { to: '/pos', label: 'Facturación POS', icon: IC.pos },
    { to: '/inventario', label: 'Inventario', icon: IC.inv },
  ] },
  { title: 'Caja', items: [
    { to: '/movimientos', label: 'Movimientos', icon: IC.mov },
    { to: '/por-cobrar', label: 'Por cobrar', icon: IC.cobrar },
    { to: '/por-pagar', label: 'Por pagar', icon: IC.pagar },
  ] },
  { title: 'Configuración', items: [
    { to: '/presupuesto', label: 'Presupuesto', icon: IC.budget },
    { to: '/politicas', label: 'Políticas', icon: IC.pol },
    { to: '/compromisos', label: 'Compromisos', icon: IC.com },
    // En móvil se llega por la pestaña "Más"; en escritorio necesita su entrada.
    { to: '/mas', label: 'Ajustes', icon: IC.ajustes },
  ] },
];

// Bottom bar (mobile): las 5 principales.
const TABS = [
  { to: '/', label: 'Radar', end: true, icon: IC.radar },
  { to: '/pos', label: 'POS', icon: IC.pos },
  { to: '/inventario', label: 'Inventario', icon: IC.inv },
  { to: '/movimientos', label: 'Caja', icon: IC.mov },
  { to: '/mas', label: 'Más', icon: IC.mas },
];

function Icon({ d }: { d: string }) {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { logout, profile } = useAuth();

  return (
    <div className="shell">
      <aside className="side">
        <img className="side-logo" src="/brand/posbank-logo-dark-wordmark.svg" alt="PosBank" />
        <nav className="side-nav">
          {GROUPS.map((g) => (
            <div key={g.title} className="side-group">
              <div className="side-group-t">{g.title}</div>
              {g.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className="side-link">
                  <Icon d={n.icon} /><span>{n.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <button className="side-logout" onClick={logout}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          <span>Salir</span>
        </button>
      </aside>

      <div className="main">
        <header className="topbar">
          <img className="top-logo" src="/brand/posbank-logo-wordmark.svg" alt="PosBank" />
          <span className="company">{profile?.email ?? ''}</span>
        </header>
        <main className="content">{children}</main>
      </div>

      <nav className="tabbar">
        {TABS.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="tab">
            <Icon d={n.icon} /><span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
