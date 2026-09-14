import { type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import './AdminShell.css';

export function AdminShell({ children }: { children: ReactNode }) {
  const { logout, session } = useAuth();
  const email = session?.user?.email ?? '';
  return (
    <div className="admin-shell">
      <header className="admin-top">
        <div className="admin-brand">
          <img src="/brand/posbank-logo-dark-wordmark.svg" alt="PosBank" />
          <span className="admin-badge">ADMIN</span>
        </div>
        <div className="admin-top-right">
          <span className="admin-email">{email}</span>
          <button className="btn btn-ghost" style={{ padding: '.5rem .9rem' }} onClick={logout}>Salir</button>
        </div>
      </header>
      <main className="admin-content">{children}</main>
    </div>
  );
}
