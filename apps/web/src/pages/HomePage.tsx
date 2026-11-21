import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS, type Role } from '../lib/api';

// Rol bazlı menü yalnızca görünüm içindir; asıl yetki kontrolü sunucuda yapılır.
const MENU: { label: string; roles: Role[] }[] = [
  { label: 'İş Emirleri', roles: ['ADMIN', 'CASHIER', 'WORKER'] },
  { label: 'Müşteri / Araç', roles: ['ADMIN', 'CASHIER'] },
  { label: 'Tahsilat', roles: ['ADMIN', 'CASHIER'] },
  { label: 'Hizmetler ve Fiyatlar', roles: ['ADMIN'] },
  { label: 'Kullanıcılar', roles: ['ADMIN'] },
  { label: 'Raporlar', roles: ['ADMIN'] },
];

export function HomePage() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const items = MENU.filter((m) => m.roles.includes(user.role));

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="font-semibold">Oto Yıkama</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-600 sm:inline">
              {user.name} · <span className="font-medium">{ROLE_LABELS[user.role]}</span>
            </span>
            <button onClick={() => void logout()} className="rounded-lg px-3 py-1.5 text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
              Çıkış
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-4 text-xl font-semibold">Hoş geldiniz, {user.name.split(' ')[0]}</h1>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((m) => (
            <li key={m.label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <p className="font-medium">{m.label}</p>
              <p className="mt-1 text-sm text-slate-500">Yakında</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
