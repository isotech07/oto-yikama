import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import type { Role } from '../lib/api';
import { ROLE_LABELS } from '../lib/format';

// Menü yalnızca görünüm içindir; asıl yetki kontrolü sunucuda yapılır.
export const NAV: { to: string; label: string; icon: string; roles: Role[] }[] = [
  { to: '/', label: 'İş Emirleri', icon: '🧽', roles: ['ADMIN', 'CASHIER', 'WORKER'] },
  { to: '/yeni', label: 'Yeni İş', icon: '➕', roles: ['ADMIN', 'CASHIER'] },
  { to: '/musteriler', label: 'Müşteriler', icon: '👥', roles: ['ADMIN', 'CASHIER'] },
  { to: '/hizmetler', label: 'Hizmetler', icon: '🏷️', roles: ['ADMIN'] },
  { to: '/kullanicilar', label: 'Kullanıcılar', icon: '🔑', roles: ['ADMIN'] },
  { to: '/raporlar', label: 'Raporlar', icon: '📊', roles: ['ADMIN'] },
];

export function Layout() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`;

  return (
    <div className="min-h-full pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
          <span className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">🚿</span>
            <span className="hidden sm:inline">Oto Yıkama</span>
          </span>
          <nav className="hidden flex-1 gap-1 md:flex" aria-label="Ana menü">
            {items.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={linkCls}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-600">
              {user.name} · <span className="font-medium">{ROLE_LABELS[user.role]}</span>
            </span>
            <button onClick={() => void logout()} className="rounded-lg px-3 py-1.5 text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
              Çıkış
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        <Outlet />
      </main>

      {items.length > 1 && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
          aria-label="Alt menü"
        >
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) => `flex flex-col items-center py-2 text-[11px] ${isActive ? 'text-brand-700' : 'text-slate-500'}`}
            >
              <span className="text-lg leading-none" aria-hidden>
                {n.icon}
              </span>
              {n.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
