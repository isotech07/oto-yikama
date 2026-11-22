import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert, Button, Card, Input, Loading, PageHeader, Select } from '../components/ui';
import { api, ApiError, type CustomerSummary, type Vehicle, type WorkOrderStatus } from '../lib/api';
import { displayPhone, displayPlate, STATUS_LABELS } from '../lib/format';
import { formatTl } from '../lib/money';
import { useAsync } from '../lib/useAsync';

type Lookup = { vehicle: Vehicle | null; openWorkOrder: { id: string; status: WorkOrderStatus } | null; plate: string };

export function NewWorkOrderPage() {
  const navigate = useNavigate();
  const services = useAsync(() => api.services.list(), []);
  const workers = useAsync(() => api.users.workers(), []);

  const [plate, setPlate] = useState('');
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [workerId, setWorkerId] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plaka yazmayı bırakınca otomatik ara (400 ms).
  useEffect(() => {
    setLookup(null);
    setLookupError(null);
    const clean = plate.replace(/[\s\-.]/g, '');
    if (clean.length < 5) return;
    const t = setTimeout(async () => {
      setLooking(true);
      try {
        const r = await api.vehicles.lookup(plate);
        setLookup(r);
        setCustomer(r.vehicle?.customer ?? null);
      } catch (e) {
        setLookupError(e instanceof Error ? e.message : 'Arama yapılamadı');
      } finally {
        setLooking(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [plate]);

  const selected = useMemo(
    () => (services.data ?? []).filter((s) => (qty[s.id] ?? 0) > 0).map((s) => ({ ...s, quantity: qty[s.id] })),
    [services.data, qty],
  );
  const total = selected.reduce((sum, s) => sum + s.priceKurus * s.quantity, 0);
  const blocked = !!lookup?.openWorkOrder;
  const canSubmit = !!lookup && !blocked && selected.length > 0 && !submitting;

  function toggle(id: string) {
    setQty((q) => ({ ...q, [id]: q[id] ? 0 : 1 }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const wo = await api.workOrders.create({
        plate,
        customerId: customer?.id ?? null,
        assignedWorkerId: workerId || null,
        note: note || null,
        items: selected.map((s) => ({ serviceId: s.id, quantity: s.quantity })),
      });
      navigate(`/is/${wo.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && typeof err.body.workOrderId === 'string') {
        setLookup((l) => l && { ...l, openWorkOrder: { id: err.body.workOrderId as string, status: 'BEKLIYOR' } });
      }
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader title="Yeni iş emri" />
      <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card title="1. Araç">
            <Input
              label="Plaka"
              value={plate}
              onChange={(e) => setPlate(e.target.value.toLocaleUpperCase('tr-TR'))}
              placeholder="34 ABC 123"
              autoFocus
              autoComplete="off"
              className="font-mono text-2xl tracking-wider uppercase"
              error={lookupError}
            />
            <div className="mt-3 min-h-6 text-sm" aria-live="polite">
              {looking && <span className="text-slate-500">Aranıyor…</span>}
              {lookup && !lookup.vehicle && <span className="text-slate-600">🆕 Yeni araç — <b>{displayPlate(lookup.plate)}</b> kaydedilecek.</span>}
              {lookup?.vehicle && (
                <span className="text-slate-700">
                  ✅ Kayıtlı araç
                  {[lookup.vehicle.brand, lookup.vehicle.model, lookup.vehicle.color].filter(Boolean).length > 0 &&
                    ` · ${[lookup.vehicle.brand, lookup.vehicle.model, lookup.vehicle.color].filter(Boolean).join(' ')}`}
                </span>
              )}
            </div>
            {blocked && (
              <div className="mt-3">
                <Alert tone="warning">
                  Bu plakaya ait açık iş emri var ({STATUS_LABELS[lookup!.openWorkOrder!.status]}).{' '}
                  <Link to={`/is/${lookup!.openWorkOrder!.id}`} className="font-semibold underline">
                    İş emrine git
                  </Link>
                </Alert>
              </div>
            )}
          </Card>

          {lookup && !blocked && <CustomerPicker value={customer} onChange={setCustomer} locked={!!lookup.vehicle?.customer} />}

          <Card title="3. Hizmetler">
            {services.loading ? (
              <Loading />
            ) : services.error ? (
              <Alert>{services.error}</Alert>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {services.data!.map((s) => {
                  const q = qty[s.id] ?? 0;
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center gap-3 rounded-lg p-3 ring-1 transition ${q ? 'bg-brand-50 ring-brand-500' : 'bg-white ring-slate-200'}`}
                    >
                      <button type="button" onClick={() => toggle(s.id)} className="flex flex-1 items-center gap-3 text-left" aria-pressed={q > 0}>
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${q ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300'}`}>
                          {q ? '✓' : ''}
                        </span>
                        <span className="flex-1">
                          <span className="block font-medium">{s.name}</span>
                          <span className="text-sm tabular-nums text-slate-600">{formatTl(s.priceKurus)}</span>
                        </span>
                      </button>
                      {q > 0 && (
                        <div className="flex items-center gap-1" aria-label={`${s.name} adedi`}>
                          <button type="button" className="h-7 w-7 rounded bg-white ring-1 ring-slate-300" onClick={() => setQty({ ...qty, [s.id]: q - 1 })} aria-label="Azalt">
                            −
                          </button>
                          <span className="w-5 text-center tabular-nums">{q}</span>
                          <button type="button" className="h-7 w-7 rounded bg-white ring-1 ring-slate-300" onClick={() => setQty({ ...qty, [s.id]: Math.min(20, q + 1) })} aria-label="Artır">
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card title="4. Atama ve not">
            <div className="space-y-3">
              <Select label="Personel" value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
                <option value="">— Sonra atanacak —</option>
                {workers.data?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
              <Input label="Not (isteğe bağlı)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="ör. Bagaj da temizlenecek" />
            </div>
          </Card>
          <Card>
            <ul className="mb-3 space-y-1 text-sm">
              {selected.map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span>
                    {s.name} {s.quantity > 1 && <span className="text-slate-500">×{s.quantity}</span>}
                  </span>
                  <span className="tabular-nums">{formatTl(s.priceKurus * s.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between border-t border-slate-100 pt-3">
              <span className="font-medium">Toplam (KDV dahil)</span>
              <span className="text-2xl font-semibold tabular-nums">{formatTl(total)}</span>
            </div>
            {error && (
              <div className="mt-3">
                <Alert>{error}</Alert>
              </div>
            )}
            <Button type="submit" size="lg" className="mt-4 w-full" disabled={!canSubmit} busy={submitting}>
              İş emrini aç
            </Button>
            {!lookup && <p className="mt-2 text-center text-xs text-slate-500">Önce plakayı girin</p>}
            {lookup && !blocked && selected.length === 0 && <p className="mt-2 text-center text-xs text-slate-500">En az bir hizmet seçin</p>}
          </Card>
        </div>
      </form>
    </>
  );
}

function CustomerPicker({ value, onChange, locked }: { value: CustomerSummary | null; onChange: (c: CustomerSummary | null) => void; locked: boolean }) {
  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => {
      api.customers.list(q).then((r) => setResults(r.items), () => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function createCustomer() {
    setSaving(true);
    setError(null);
    try {
      onChange(await api.customers.create({ name, phone: phone || null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  if (value)
    return (
      <Card title="2. Müşteri">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">{value.name}</p>
            {value.phone && <p className="text-sm text-slate-500">{displayPhone(value.phone)}</p>}
          </div>
          {!locked && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              Değiştir
            </Button>
          )}
        </div>
      </Card>
    );

  return (
    <Card
      title="2. Müşteri (isteğe bağlı)"
      actions={
        <Button type="button" variant="ghost" size="sm" onClick={() => setMode(mode === 'search' ? 'new' : 'search')}>
          {mode === 'search' ? '+ Yeni müşteri' : 'Kayıtlılardan seç'}
        </Button>
      }
    >
      {mode === 'search' ? (
        <>
          <Input label="Ad veya telefon" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ayşe / 0532…" />
          {results.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
              {results.map((c) => (
                <li key={c.id}>
                  <button type="button" className="w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => onChange(c)}>
                    <span className="font-medium">{c.name}</span>{' '}
                    <span className="text-sm text-slate-500">{displayPhone(c.phone)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Ad soyad" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Telefon" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0532 123 45 67" />
          </div>
          {error && <Alert>{error}</Alert>}
          <Button type="button" variant="secondary" onClick={createCustomer} busy={saving} disabled={name.trim().length < 2}>
            Müşteriyi kaydet
          </Button>
        </div>
      )}
    </Card>
  );
}
