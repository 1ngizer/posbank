import { type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Movements } from './pages/Movements';
import { Receivables } from './pages/Receivables';
import { Payables } from './pages/Payables';
import { Inventory } from './pages/Inventory';
import { Pos } from './pages/Pos';
import { Budget } from './pages/Budget';
import { Policies } from './pages/Policies';
import { Commitments } from './pages/Commitments';
import { Accounting } from './pages/Accounting';
import { Mas } from './pages/Mas';
import { Onboarding } from './pages/Onboarding';
import { AdminShell } from './components/AdminShell';
import { AdminHome } from './pages/admin/AdminHome';
import { AdminCompany } from './pages/admin/AdminCompany';
import { ResetPassword } from './pages/ResetPassword';

function RequireAuth({ children }: { children: ReactElement }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="center"><div className="spin" /></div>;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

// Panel de administrador de plataforma (Ingizer).
function AdminApp() {
  return (
    <AdminShell>
      <Routes>
        <Route path="/" element={<AdminHome />} />
        <Route path="/cliente/:id" element={<AdminCompany />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AdminShell>
  );
}

export default function App() {
  const { session, loading, isAdmin, needsOnboarding } = useAuth();
  return (
    <Routes>
      <Route
        path="/login"
        element={
          loading ? <div className="center"><div className="spin" /></div>
          : session ? <Navigate to="/" replace /> : <Login />
        }
      />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            {isAdmin ? <AdminApp /> : needsOnboarding ? <Onboarding /> : (
            <AppShell>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/pos" element={<Pos />} />
                <Route path="/inventario" element={<Inventory />} />
                <Route path="/movimientos" element={<Movements />} />
                <Route path="/por-cobrar" element={<Receivables />} />
                <Route path="/por-pagar" element={<Payables />} />
                <Route path="/presupuesto" element={<Budget />} />
                <Route path="/politicas" element={<Policies />} />
                <Route path="/compromisos" element={<Commitments />} />
                <Route path="/contabilidad" element={<Accounting />} />
                <Route path="/mas" element={<Mas />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
            )}
          </RequireAuth>
        }
      />
    </Routes>
  );
}
