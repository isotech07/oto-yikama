import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Alert, Button, Card, Empty, Input, Loading, Modal, PageHeader, Select, StatusBadge } from '../components/ui';
import { api, type CustomerDetail, type PaymentMethod, type VehicleSummary } from '../lib/api';
import { displayPhone, displayPlate, fmtDateTime, METHOD_LABELS } from '../lib/format';
import { formatTl, kurusToInput, parseTl } from '../lib/money';
import { useAsync } from '../lib/useAsync';

export function CustomersPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => (setDebounced(q), setPage(1)), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading } = useAsync(() => api.customers.list(debounced || undefined, page), [debounced, page]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader title="Müşteriler" actions={<Button onClick={() => setCreateOpen(true)}>+ Yeni müşteri</Button>} />
      <div className="mb-4 max-w-md">
        <Input label="Ara" placeholder="Ad, telefon veya plaka" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <Alert>{error}</Alert>}
      {loading && !data ? (
        <Loading />
      ) : data?.items.length === 0 ? (
        <Empty>Müşteri bulunamadı.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <ul className="divide-y divide-slate-100">
            {data?.items.map((c) => (
              <li key={c.id}>
                <Link to={`/musteriler/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-sm text-slate-500">{displayPhone(c.phone) || '—'}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {c.vehicles.map((v) => (
                      <span key={v.id} className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs">
                        {displayPlate(v.plate)}
                      </span>
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3 text-sm">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Önceki
          </Button>
          <span>
            {page} / {pages}
          </span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Sonraki →
          </Button>
        </div>
      )}
      <CustomerForm open={createOpen} onClose={() => setCreateOpen(false)} onSaved={(id) => navigate(`/musteriler/${id}`)} />
    </>
  );
}

function CustomerForm({
  open,
  onClose,
  onSaved,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
  initial?: { id: string; name: string; phone: string | null; smsConsent?: boolean };
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [smsConsent, setSmsConsent] = useState(initial?.smsConsent ?? false);
  const [phone, setPhone] = useState(initial?.phone ? displayPhone(initial.phone) : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = { name, phone: phone.trim() || null, smsConsent };
      const r = initial ? await api.customers.update(initial.id, body) : await api.customers.create(body);
      onSaved(r.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={initial ? 'Müşteriyi düzenle' : 'Yeni müşteri'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Ad soyad" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        <Input label="Telefon" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0532 123 45 67" />
        <SmsConsent checked={smsConsent} onChange={setSmsConsent} />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" busy={saving}>
          Kaydet
        </Button>
      </form>
    </Modal>
  );
}

export function SmsConsent({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        Müşteri SMS bildirimi almayı kabul etti
        <span className="block text-xs text-slate-500">Yalnız "aracınız hazır" bilgilendirmesi gönderilir (KVKK açık rıza).</span>
      </span>
    </label>
  );
}

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: c, error, loading, reload } = useAsync(() => api.customers.get(id), [id]);
  const [editOpen, setEditOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState<VehicleSummary | 'new' | null>(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);

  if (loading && !c) return <Loading />;
  if (error || !c) return <Alert>{error ?? 'Bulunamadı'}</Alert>;

  async function remove() {
    if (!confirm(`${c!.name} silinsin mi? (Geçmiş kayıtlar korunur)`)) return;
    try {
      await api.customers.remove(c!.id);
      navigate('/musteriler', { replace: true });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Silinemedi');
    }
  }

  return (
    <>
      <PageHeader
        back={
          <Link to="/musteriler" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Geri">
            ←
          </Link>
        }
        title={c.name}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              Düzenle
            </Button>
            {user?.role === 'ADMIN' && (
              <Button variant="danger" onClick={remove}>
                Sil
              </Button>
            )}
          </>
        }
      />
      {c.outstandingKurus > 0 && (
        <div className="mb-4">
          <Alert tone="warning">
            Açık borç: <b>{formatTl(c.outstandingKurus)}</b> — teslim edilmiş iş emirlerinden tahsil edilmemiş tutar.
          </Alert>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="İletişim ve araçlar"
          actions={
            <Button size="sm" variant="secondary" onClick={() => setVehicleOpen('new')}>
              + Araç
            </Button>
          }
        >
          <p className="mb-1 text-sm">
            📞{' '}
            {c.phone ? (
              <a className="text-brand-700" href={`tel:0${c.phone}`}>
                {displayPhone(c.phone)}
              </a>
            ) : (
              '—'
            )}
          </p>
          <p className="mb-3 text-xs text-slate-500">
            SMS izni: {c.smsConsent ? 'var' : 'yok'} · Veresiye:{' '}
            {c.creditAllowed ? `açık${c.creditLimitKurus !== null ? ` (limit ${formatTl(c.creditLimitKurus)})` : ' (limitsiz)'}` : 'kapalı'}
            {user?.role === 'ADMIN' && (
              <button className="ml-2 text-brand-700 underline" onClick={() => setCreditOpen(true)}>
                değiştir
              </button>
            )}
          </p>
          {c.vehicles.length === 0 ? (
            <p className="text-sm text-slate-500">Kayıtlı araç yok.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {c.vehicles.map((v) => (
                <li key={v.id} className="flex items-center justify-between py-2">
                  <span>
                    <span className="font-mono font-semibold">{displayPlate(v.plate)}</span>{' '}
                    <span className="text-sm text-slate-500">{[v.brand, v.model, v.color].filter(Boolean).join(' ')}</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setVehicleOpen(v)}>
                    Düzenle
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card
          title="Paketler"
          actions={
            <Button size="sm" variant="secondary" onClick={() => setSellOpen(true)}>
              + Paket sat
            </Button>
          }
        >
          {c.packages.length === 0 ? (
            <p className="text-sm text-slate-500">Paket yok.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {c.packages.map((p) => {
                const expired = p.expiresAt && new Date(p.expiresAt) < new Date();
                return (
                  <li key={p.id} className={`flex items-center justify-between py-2 ${expired || !p.remainingCredits ? 'text-slate-400' : ''}`}>
                    <span>
                      {p.name}
                      <span className="block text-xs text-slate-500">
                        {fmtDateTime(p.createdAt)}
                        {p.expiresAt && ` · ${expired ? 'süresi doldu' : `son gün ${p.expiresAt.slice(0, 10)}`}`}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">
                      {p.remainingCredits}/{p.totalCredits}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Son iş emirleri">
          {c.workOrders.length === 0 ? (
            <p className="text-sm text-slate-500">Henüz iş emri yok.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {c.workOrders.map((w) => (
                <li key={w.id}>
                  <Link to={`/is/${w.id}`} className="flex items-center justify-between py-2 hover:text-brand-700">
                    <span className="text-sm">
                      <span className="font-mono">{displayPlate(w.vehicle.plate)}</span> · {fmtDateTime(w.createdAt)}
                    </span>
                    <StatusBadge status={w.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {editOpen && <CustomerForm open initial={c} onClose={() => setEditOpen(false)} onSaved={() => void reload()} />}
      {sellOpen && <SellPackage customerId={c.id} onClose={() => setSellOpen(false)} onDone={() => (setSellOpen(false), void reload())} />}
      {creditOpen && <CreditForm c={c} onClose={() => setCreditOpen(false)} onDone={() => (setCreditOpen(false), void reload())} />}
      {vehicleOpen && (
        <VehicleForm
          customerId={c.id}
          vehicle={vehicleOpen === 'new' ? undefined : vehicleOpen}
          isAdmin={user?.role === 'ADMIN'}
          onClose={() => setVehicleOpen(null)}
          onSaved={() => (setVehicleOpen(null), void reload())}
        />
      )}
    </>
  );
}

function VehicleForm({
  customerId,
  vehicle,
  isAdmin,
  onClose,
  onSaved,
}: {
  customerId: string;
  vehicle?: VehicleSummary;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [plate, setPlate] = useState(vehicle ? displayPlate(vehicle.plate) : '');
  const [brand, setBrand] = useState(vehicle?.brand ?? '');
  const [model, setModel] = useState(vehicle?.model ?? '');
  const [color, setColor] = useState(vehicle?.color ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = { plate, brand, model, color };
      if (vehicle) await api.vehicles.update(vehicle.id, body);
      else await api.vehicles.create({ ...body, customerId });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!vehicle || !confirm('Araç silinsin mi?')) return;
    try {
      await api.vehicles.remove(vehicle.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi');
    }
  }

  return (
    <Modal open title={vehicle ? 'Aracı düzenle' : 'Araç ekle'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Plaka" value={plate} onChange={(e) => setPlate(e.target.value.toLocaleUpperCase('tr-TR'))} className="font-mono uppercase" required />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Marka" value={brand} onChange={(e) => setBrand(e.target.value)} />
          <Input label="Model" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <Input label="Renk" value={color} onChange={(e) => setColor(e.target.value)} />
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" busy={saving}>
            Kaydet
          </Button>
          {vehicle && isAdmin && (
            <Button type="button" variant="danger" onClick={remove}>
              Sil
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

function SellPackage({ customerId, onClose, onDone }: { customerId: string; onClose: () => void; onDone: () => void }) {
  const pkgs = useAsync(() => api.packages.list(), []);
  const [packageId, setPackageId] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('KART');
  const [key] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selected = pkgs.data?.find((p) => p.id === packageId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!packageId) return setError('Paket seçin');
    setSaving(true);
    setError(null);
    try {
      await api.customers.sellPackage(customerId, { packageId, method, idempotencyKey: key });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Satış yapılamadı');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title="Paket sat" onClose={onClose}>
      {pkgs.loading ? (
        <Loading />
      ) : pkgs.data?.length === 0 ? (
        <p className="text-sm text-slate-500">Satışta paket yok. Yönetici Hizmetler sayfasından paket tanımlayabilir.</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Select label="Paket" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
            <option value="">— Seçin —</option>
            {pkgs.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatTl(p.priceKurus)}
              </option>
            ))}
          </Select>
          <Select label="Ödeme yöntemi" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(['KART', 'NAKIT', 'HAVALE'] as const).map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
          {selected && (
            <p className="rounded-lg bg-slate-50 p-3 text-sm">
              {selected.credits} × {selected.service.name}
              {selected.validDays ? `, ${selected.validDays} gün geçerli` : ', süresiz'}. Tahsil edilecek: <b>{formatTl(selected.priceKurus)}</b>
            </p>
          )}
          {error && <Alert>{error}</Alert>}
          <Button type="submit" className="w-full" busy={saving} disabled={!packageId}>
            Tahsil et ve paketi tanımla
          </Button>
        </form>
      )}
    </Modal>
  );
}

function CreditForm({ c, onClose, onDone }: { c: CustomerDetail; onClose: () => void; onDone: () => void }) {
  const [allowed, setAllowed] = useState(c.creditAllowed);
  const [limit, setLimit] = useState(c.creditLimitKurus !== null ? kurusToInput(c.creditLimitKurus) : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const lim = limit.trim() ? parseTl(limit) : null;
    if (limit.trim() && lim === null) return setError('Geçerli bir limit girin');
    setSaving(true);
    setError(null);
    try {
      await api.customers.update(c.id, { creditAllowed: allowed, creditLimitKurus: lim });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title="Veresiye ayarı" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={allowed} onChange={(e) => setAllowed(e.target.checked)} />
          <span>Bu müşteri ödemeden teslim alabilir (cari hesap)</span>
        </label>
        <Input label="Borç limiti (₺)" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} hint="Boş bırakılırsa limitsiz" disabled={!allowed} />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" busy={saving}>
          Kaydet
        </Button>
      </form>
    </Modal>
  );
}
