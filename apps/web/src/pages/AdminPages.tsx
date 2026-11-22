import { type FormEvent, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Alert, Button, Card, Empty, Input, Loading, Modal, PageHeader, Select, Stat } from '../components/ui';
import { api, type ManagedUser, type PackageDef, type Role, type Service } from '../lib/api';
import { METHOD_LABELS, ROLE_LABELS, todayTr } from '../lib/format';
import { formatTl, kurusToInput, parseTl, vatLabel } from '../lib/money';
import { useAsync } from '../lib/useAsync';

// ---------------- Hizmetler ----------------

export function ServicesPage() {
  const { data, error, loading, reload } = useAsync(() => api.services.list(true), []);
  const [editing, setEditing] = useState<Service | 'new' | null>(null);

  return (
    <>
      <PageHeader title="Hizmetler ve fiyatlar" actions={<Button onClick={() => setEditing('new')}>+ Yeni hizmet</Button>} />
      <p className="mb-4 text-sm text-slate-500">
        Fiyatlar KDV dahildir. Fiyat değişikliği yalnızca yeni iş emirlerini etkiler; açılmış iş emirleri eski fiyatla kalır.
      </p>
      {error && <Alert>{error}</Alert>}
      {loading && !data ? (
        <Loading />
      ) : data?.length === 0 ? (
        <Empty>Henüz hizmet yok.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Hizmet</th>
                <th className="px-4 py-2.5 text-right font-medium">Fiyat</th>
                <th className="px-4 py-2.5 text-right font-medium">KDV</th>
                <th className="px-4 py-2.5 font-medium">Durum</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.map((s) => (
                <tr key={s.id} className={s.isActive ? '' : 'text-slate-400'}>
                  <td className="px-4 py-2.5 font-medium">{s.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatTl(s.priceKurus)}</td>
                  <td className="px-4 py-2.5 text-right">{vatLabel(s.vatRateBp)}</td>
                  <td className="px-4 py-2.5">{s.isActive ? 'Aktif' : 'Pasif'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                      Düzenle
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PackagesSection services={data ?? []} />
      {editing && (
        <ServiceForm service={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), void reload())} />
      )}
    </>
  );
}

function ServiceForm({ service, onClose, onSaved }: { service?: Service; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(service?.name ?? '');
  const [price, setPrice] = useState(service ? kurusToInput(service.priceKurus) : '');
  const [vat, setVat] = useState(String((service?.vatRateBp ?? 2000) / 100));
  const [isActive, setIsActive] = useState(service?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const priceKurus = parseTl(price);
    const vatNum = Number(vat.replace(',', '.'));
    if (priceKurus === null) return setError('Geçerli bir fiyat girin (ör. 250 veya 250,50)');
    if (!Number.isFinite(vatNum) || vatNum < 0 || vatNum > 100) return setError('KDV 0-100 arasında olmalı');
    const body = { name, priceKurus, vatRateBp: Math.round(vatNum * 100), isActive };
    setSaving(true);
    setError(null);
    try {
      if (service) await api.services.update(service.id, body);
      else await api.services.create(body);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!service || !confirm(`${service.name} silinsin mi? Geçmiş iş emirleri etkilenmez.`)) return;
    try {
      await api.services.remove(service.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi');
    }
  }

  return (
    <Modal open title={service ? 'Hizmeti düzenle' : 'Yeni hizmet'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Ad" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Fiyat (₺, KDV dahil)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
          <Input label="KDV (%)" inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Aktif (yeni iş emirlerinde seçilebilir)
        </label>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" busy={saving}>
            Kaydet
          </Button>
          {service && (
            <Button type="button" variant="danger" onClick={remove}>
              Sil
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

function PackagesSection({ services }: { services: Service[] }) {
  const { data, error, loading, reload } = useAsync(() => api.packages.list(true), []);
  const [editing, setEditing] = useState<PackageDef | 'new' | null>(null);
  return (
    <div className="mt-8">
      <PageHeader title="Paketler" actions={<Button variant="secondary" onClick={() => setEditing('new')}>+ Yeni paket</Button>} />
      <p className="mb-4 text-sm text-slate-500">
        Paket satışı tahsil edildiği gün ciroya yazılır. Paketle yapılan yıkama iş emrinde 0 TL görünür ve müşterinin kredisinden düşer.
      </p>
      {error && <Alert>{error}</Alert>}
      {loading && !data ? (
        <Loading />
      ) : data?.length === 0 ? (
        <Empty>Henüz paket yok. Örn. "10 Dış Yıkama" paketi tanımlayın.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Paket</th>
                <th className="px-4 py-2.5 font-medium">Hizmet</th>
                <th className="px-4 py-2.5 text-right font-medium">Kredi</th>
                <th className="px-4 py-2.5 text-right font-medium">Fiyat</th>
                <th className="px-4 py-2.5 font-medium">Geçerlilik</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.map((p) => (
                <tr key={p.id} className={p.isActive ? '' : 'text-slate-400'}>
                  <td className="px-4 py-2.5 font-medium">{p.name}</td>
                  <td className="px-4 py-2.5">{p.service.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.credits}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatTl(p.priceKurus)}</td>
                  <td className="px-4 py-2.5">{p.validDays ? `${p.validDays} gün` : 'Süresiz'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                      Düzenle
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <PackageForm pkg={editing === 'new' ? undefined : editing} services={services.filter((s) => s.isActive)} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), void reload())} />
      )}
    </div>
  );
}

function PackageForm({ pkg, services, onClose, onSaved }: { pkg?: PackageDef; services: Service[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(pkg?.name ?? '');
  const [serviceId, setServiceId] = useState(pkg?.service.id ?? services[0]?.id ?? '');
  const [credits, setCredits] = useState(String(pkg?.credits ?? 10));
  const [price, setPrice] = useState(pkg ? kurusToInput(pkg.priceKurus) : '');
  const [validDays, setValidDays] = useState(pkg?.validDays ? String(pkg.validDays) : '');
  const [isActive, setIsActive] = useState(pkg?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const service = services.find((s) => s.id === serviceId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const priceKurus = parseTl(price);
    if (priceKurus === null) return setError('Geçerli bir fiyat girin');
    const vd = validDays.trim() ? Number(validDays) : null;
    setSaving(true);
    setError(null);
    try {
      if (pkg) await api.packages.update(pkg.id, { name, priceKurus, validDays: vd, isActive });
      else
        await api.packages.create({ name, serviceId, credits: Number(credits), priceKurus, vatRateBp: service?.vatRateBp ?? 2000, validDays: vd, isActive });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={pkg ? 'Paketi düzenle' : 'Yeni paket'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Ad" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="10 Dış Yıkama" />
        {!pkg && (
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <Select label="Hizmet" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Input label="Kredi" type="number" min={1} max={1000} value={credits} onChange={(e) => setCredits(e.target.value)} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Paket fiyatı (₺)"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            hint={service && !pkg ? `Tekli toplam: ${formatTl(service.priceKurus * Number(credits || 0))}` : undefined}
          />
          <Input label="Geçerlilik (gün)" type="number" min={1} value={validDays} onChange={(e) => setValidDays(e.target.value)} hint="Boş = süresiz" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Satışta
        </label>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" busy={saving}>
          Kaydet
        </Button>
      </form>
    </Modal>
  );
}

// ---------------- Kullanıcılar ----------------

export function UsersPage() {
  const { user: me } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.users.list(), []);
  const [editing, setEditing] = useState<ManagedUser | 'new' | null>(null);

  return (
    <>
      <PageHeader title="Kullanıcılar" actions={<Button onClick={() => setEditing('new')}>+ Yeni kullanıcı</Button>} />
      {error && <Alert>{error}</Alert>}
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Ad</th>
                <th className="px-4 py-2.5 font-medium">E-posta</th>
                <th className="px-4 py-2.5 font-medium">Rol</th>
                <th className="px-4 py-2.5 font-medium">Durum</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.map((u) => (
                <tr key={u.id} className={u.isActive ? '' : 'text-slate-400'}>
                  <td className="px-4 py-2.5 font-medium">
                    {u.name} {u.id === me?.id && <span className="text-xs text-slate-400">(siz)</span>}
                  </td>
                  <td className="px-4 py-2.5">{u.email}</td>
                  <td className="px-4 py-2.5">{ROLE_LABELS[u.role]}</td>
                  <td className="px-4 py-2.5">{u.isActive ? 'Aktif' : 'Pasif'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                      Düzenle
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <UserForm
          user={editing === 'new' ? undefined : editing}
          isSelf={editing !== 'new' && editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSaved={() => (setEditing(null), void reload())}
        />
      )}
    </>
  );
}

function UserForm({ user, isSelf, onClose, onSaved }: { user?: ManagedUser; isSelf: boolean; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState(user?.email ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'WORKER');
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (user) await api.users.update(user.id, { name, role, isActive, ...(password ? { password } : {}) });
      else await api.users.create({ email, name, role, password });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={user ? 'Kullanıcıyı düzenle' : 'Yeni kullanıcı'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {!user && <Input label="E-posta" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />}
        <Input label="Ad soyad" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        <Select label="Rol" value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as Role)}>
          {(['WORKER', 'CASHIER', 'ADMIN'] as const).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        <Input
          label={user ? 'Yeni şifre (değiştirmek için)' : 'Şifre'}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required={!user}
          minLength={8}
          autoComplete="new-password"
          hint="En az 8 karakter. Şifre değişince kullanıcının açık oturumları kapanır."
        />
        {user && !isSelf && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Aktif (pasif kullanıcı giriş yapamaz)
          </label>
        )}
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" busy={saving}>
          Kaydet
        </Button>
      </form>
    </Modal>
  );
}

// ---------------- Raporlar ----------------

function shiftDays(d: string, n: number) {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

export function ReportsPage() {
  const today = todayTr();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const { data: r, error, loading } = useAsync(() => api.reports.summary(from, to), [from, to]);

  const presets: [string, string, string][] = [
    ['Bugün', today, today],
    ['Dün', shiftDays(today, -1), shiftDays(today, -1)],
    ['Son 7 gün', shiftDays(today, -6), today],
    ['Bu ay', today.slice(0, 8) + '01', today],
  ];
  const maxService = Math.max(1, ...(r?.services.map((s) => s.grossKurus) ?? [1]));

  return (
    <>
      <PageHeader title="Raporlar" />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Input label="Başlangıç" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="w-40">
          <Input label="Bitiş" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1">
          {presets.map(([label, f, t]) => (
            <Button key={label} size="sm" variant={from === f && to === t ? 'primary' : 'secondary'} onClick={() => (setFrom(f), setTo(t))}>
              {label}
            </Button>
          ))}
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      {loading && !r ? (
        <Loading />
      ) : r ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Kasa (tahsilat)" value={formatTl(r.payments.totalKurus)} sub={r.payments.refundCount ? `İade dahil: ${formatTl(r.payments.refundKurus)}` : 'İade yok'} />
            <Stat label="Ciro (teslim + paket)" value={formatTl(r.revenue.grossKurus)} sub={`KDV ${formatTl(r.revenue.vatKurus)} · Net ${formatTl(r.revenue.netKurus)}`} />
            <Stat label="Teslim edilen araç" value={r.workOrders.delivered} sub={`${r.workOrders.created} açıldı · ${r.workOrders.cancelled} iptal`} />
            <Stat label="Şu an açık" value={r.workOrders.openNow} sub="Tarihten bağımsız" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Paket satışı" value={formatTl(r.packages.grossKurus)} sub={`${r.packages.sold} paket (ciroya dahil)`} />
            <Stat label="Açık alacak (veresiye)" value={formatTl(r.receivablesKurus)} sub="Bugün itibarıyla, tüm zamanlar" />
            <Stat
              label="Kasa farkı"
              value={<span className={r.cashClosings.totalDifferenceKurus ? 'text-red-700' : ''}>{formatTl(r.cashClosings.totalDifferenceKurus)}</span>}
              sub={`${r.cashClosings.closedDays} gün kapatıldı`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Ödeme yöntemleri">
              <dl className="space-y-2 text-sm">
                {(['NAKIT', 'KART', 'HAVALE'] as const).map((m) => (
                  <div key={m} className="flex justify-between">
                    <dt>{METHOD_LABELS[m]}</dt>
                    <dd className="tabular-nums">{formatTl(r.payments.byMethod[m])}</dd>
                  </div>
                ))}
                <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold">
                  <dt>Toplam</dt>
                  <dd className="tabular-nums">{formatTl(r.payments.totalKurus)}</dd>
                </div>
              </dl>
            </Card>

            <Card title="Hizmetler (teslim edilen)" className="lg:col-span-2">
              {r.services.length === 0 ? (
                <p className="text-sm text-slate-500">Bu aralıkta teslim edilen iş yok.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-500">
                    <tr>
                      <th className="pb-2 font-medium">Hizmet</th>
                      <th className="pb-2 text-right font-medium">Adet</th>
                      <th className="w-1/3 pb-2 pl-3 font-medium">Ciro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.services.map((s) => (
                      <tr key={s.name}>
                        <td className="py-1.5">{s.name}</td>
                        <td className="py-1.5 text-right tabular-nums">{s.quantity}</td>
                        <td className="py-1.5 pl-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(s.grossKurus / maxService) * 100}%`, minWidth: 4 }} />
                            <span className="whitespace-nowrap tabular-nums">{formatTl(s.grossKurus)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <Card title="Personel (teslim edilen araç)">
            {r.workers.length === 0 ? (
              <p className="text-sm text-slate-500">Veri yok.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {r.workers.map((w) => (
                  <li key={w.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span>{w.name}</span>
                    <span className="font-semibold tabular-nums">{w.delivered}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}
    </>
  );
}
