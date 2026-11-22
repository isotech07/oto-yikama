import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import type { Role } from './lib/api';
import { ReportsPage, ServicesPage, UsersPage } from './pages/AdminPages';
import { BoardPage } from './pages/BoardPage';
import { CustomerDetailPage, CustomersPage } from './pages/CustomersPage';
import { LoginPage } from './pages/LoginPage';
import { NewWorkOrderPage } from './pages/NewWorkOrderPage';
import { WorkOrderPage } from './pages/WorkOrderPage';

/** Rol dışı sayfaya gidilirse ana sayfaya yönlendirir (görünüm kolaylığı; yetki sunucuda). */
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  return user && roles.includes(user.role) ? <>{children}</> : <Navigate to="/" replace />;
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-full items-center justify-center text-slate-500">Yükleniyor…</div>;
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<BoardPage />} />
        <Route path="is/:id" element={<WorkOrderPage />} />
        <Route path="yeni" element={<RequireRole roles={['ADMIN', 'CASHIER']}><NewWorkOrderPage /></RequireRole>} />
        <Route path="musteriler" element={<RequireRole roles={['ADMIN', 'CASHIER']}><CustomersPage /></RequireRole>} />
        <Route path="musteriler/:id" element={<RequireRole roles={['ADMIN', 'CASHIER']}><CustomerDetailPage /></RequireRole>} />
        <Route path="hizmetler" element={<RequireRole roles={['ADMIN']}><ServicesPage /></RequireRole>} />
        <Route path="kullanicilar" element={<RequireRole roles={['ADMIN']}><UsersPage /></RequireRole>} />
        <Route path="raporlar" element={<RequireRole roles={['ADMIN']}><ReportsPage /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
