import { AuthProvider, useAuth } from './auth/AuthContext';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-full items-center justify-center text-slate-500">Yükleniyor…</div>;
  return user ? <HomePage /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
