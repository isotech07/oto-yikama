import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Alert, Button, Card, Input, Loading, Modal, PageHeader, Select, StatusBadge } from '../components/ui';
import { api, type PaymentMethod, type WorkOrder, type WorkOrderStatus } from '../lib/api';
import { displayPhone, displayPlate, fmtDateTime, METHOD_LABELS, STATUS_ACTIONS } from '../lib/format';
import { formatTl, kurusToInput, parseTl, vatLabel } from '../lib/money';
import { useAsync } from '../lib/useAsync';

export function WorkOrderPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { data: wo, setData, error, loading } = useAsync(() => api.workOrders.get(id), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const isStaff = user?.role === 'ADMIN' || user?.role === 'CASHIER';

  async function run(key: string, fn: () => Promise<WorkOrder>) {
    setBusy(key);
    setActionError(null);
    try {
      setData(await fn());
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'İşlem yapılamadı');
    } finally {
      setBusy(null);
    }
  }

  if (loading && !wo) return <Loading />;
  if (error || !wo) return <Alert>{error ?? 'Bulunamadı'}</Alert>;

  const open = !['TESLIM_EDILDI', 'CANCELLED'].includes(wo.status);
  const onCredit = (wo.balanceKurus ?? 0) > 0;
  const changeStatus = (to: WorkOrderStatus) => {
    if (to === 'CANCELLED' && !confirm('İş emri iptal edilsin mi?')) return;
    if (to === 'TESLIM_EDILDI' && onCredit && !confirm(`${formatTl(wo.balanceKurus!)} müşterinin cari hesabına (veresiye) yazılarak teslim edilsin mi?`)) return;
    void run(`s-${to}`, () => api.workOrders.status(wo.id, to));
  };

  return (
    <>
      <PageHeader
        back={
          <Link to="/" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Geri">
            ←
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <span className="font-mono tracking-wide">{displayPlate(wo.vehicle.plate)}</span>
            <StatusBadge status={wo.status} />
          </span>
        }
      />

      {actionError && (
        <div className="mb-4">
          <Alert>{actionError}</Alert>
        </div>
      )}

      {wo.allowedNext.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {wo.allowedNext.map((to) => (
            <Button
              key={to}
              size="lg"
              variant={to === 'CANCELLED' ? 'danger' : to === 'TESLIM_EDILDI' ? 'success' : 'primary'}
              busy={busy === `s-${to}`}
              disabled={!!busy}
              onClick={() => changeStatus(to)}
              className={to === 'CANCELLED' ? '' : 'flex-1 sm:flex-none'}
            >
              {to === 'TESLIM_EDILDI' && onCredit ? 'Veresiye teslim et' : STATUS_ACTIONS[to]}
            </Button>
          ))}
        </div>
      )}
      {isStaff && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Link to={`/is/${wo.id}/fis`} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-300 hover:bg-slate-50">
            🧾 Bilgi fişi
          </Link>
          {wo.notifications?.map((n) => (
            <span
              key={n.kind}
              className={`rounded-full px-2.5 py-1 text-xs ${n.status === 'SENT' ? 'bg-emerald-50 text-emerald-700' : n.status === 'FAILED' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}
              title={n.lastError ?? ''}
            >
              SMS: {n.status === 'SENT' ? 'gönderildi' : n.status === 'FAILED' ? 'gönderilemedi' : `sırada (${n.attempts} deneme)`}
            </span>
          ))}
        </div>
      )}
      {isStaff && wo.status === 'HAZIR' && (wo.balanceKurus ?? 0) > 0 && !wo.customer?.creditAllowed && (
        <div className="mb-4">
          <Alert tone="warning">Teslim için önce kalan {formatTl(wo.balanceKurus!)} tahsil edilmeli.</Alert>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card
            title="Hizmetler"
            actions={
              isStaff &&
              open && (
                <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
                  + Ekle
                </Button>
              )
            }
          >
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">Hizmet</th>
                  <th className="pb-2 text-right font-medium">Adet</th>
                  <th className="pb-2 text-right font-medium">Tutar</th>
                  {isStaff && open && <th className="w-8" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {wo.items.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2">
                      {i.serviceName}
                      <span className="ml-1 text-xs text-slate-400">KDV {vatLabel(i.vatRateBp)}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{i.quantity}</td>
                    <td className="py-2 text-right tabular-nums">{formatTl(i.lineTotal)}</td>
                    {isStaff && open && (
                      <td className="py-2 text-right">
                        {wo.items.length > 1 && (
                          <button
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={`${i.serviceName} çıkar`}
                            disabled={!!busy}
                            onClick={() => confirm(`${i.serviceName} çıkarılsın mı?`) && void run(`rm-${i.id}`, () => api.workOrders.removeItem(wo.id, i.id))}
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between text-slate-500">
                <dt>Ara toplam (KDV hariç)</dt>
                <dd className="tabular-nums">{formatTl(wo.totals.netKurus)}</dd>
              </div>
              <div className="flex justify-between text-slate-500">
                <dt>KDV</dt>
                <dd className="tabular-nums">{formatTl(wo.totals.vatKurus)}</dd>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <dt>Toplam</dt>
                <dd className="tabular-nums">{formatTl(wo.totals.grossKurus)}</dd>
              </div>
            </dl>
          </Card>

          {isStaff && wo.payments && <Payments wo={wo} onChange={setData} isAdmin={user?.role === 'ADMIN'} />}
        </div>

        <div className="space-y-4">
          <Card title="Bilgiler">
            <dl className="space-y-2 text-sm">
              <Row label="Araç">{[wo.vehicle.brand, wo.vehicle.model, wo.vehicle.color].filter(Boolean).join(' ') || '—'}</Row>
              <Row label="Müşteri">
                {wo.customer ? (
                  isStaff ? (
                    <Link to={`/musteriler/${wo.customer.id}`} className="text-brand-700 hover:underline">
                      {wo.customer.name}
                    </Link>
                  ) : (
                    wo.customer.name
                  )
                ) : (
                  '—'
                )}
                {wo.customer?.phone && (
                  <a href={`tel:0${wo.customer.phone}`} className="block text-slate-500">
                    {displayPhone(wo.customer.phone)}
                  </a>
                )}
              </Row>
              <Row label="Açılış">
                {fmtDateTime(wo.createdAt)} · {wo.createdBy.name}
              </Row>
              {wo.deliveredAt && <Row label="Teslim">{fmtDateTime(wo.deliveredAt)}</Row>}
              {wo.cancelledAt && <Row label="İptal">{fmtDateTime(wo.cancelledAt)}</Row>}
            </dl>
            {isStaff && open ? (
              <div className="mt-4 space-y-3">
                <WorkerSelect wo={wo} busy={!!busy} onAssign={(wid) => run('assign', () => api.workOrders.assign(wo.id, wid))} />
                <NoteEditor wo={wo} onSave={(n) => run('note', () => api.workOrders.note(wo.id, n))} />
              </div>
            ) : (
              <dl className="mt-2 space-y-2 text-sm">
                <Row label="Personel">{wo.assignedWorker?.name ?? '—'}</Row>
                {wo.note && <Row label="Not">{wo.note}</Row>}
              </dl>
            )}
          </Card>
        </div>
      </div>

      <AddItemsModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={(items) => run('add', () => api.workOrders.addItems(wo.id, items)).then(() => setAddOpen(false))} />
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function WorkerSelect({ wo, busy, onAssign }: { wo: WorkOrder; busy: boolean; onAssign: (id: string | null) => void }) {
  const workers = useAsync(() => api.users.workers(), []);
  return (
    <Select label="Personel" value={wo.assignedWorker?.id ?? ''} disabled={busy} onChange={(e) => onAssign(e.target.value || null)}>
      <option value="">— Atanmadı —</option>
      {wo.assignedWorker && !workers.data?.some((w) => w.id === wo.assignedWorker!.id) && (
        <option value={wo.assignedWorker.id}>{wo.assignedWorker.name}</option>
      )}
      {workers.data?.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </Select>
  );
}

function NoteEditor({ wo, onSave }: { wo: WorkOrder; onSave: (n: string | null) => void }) {
  const [note, setNote] = useState(wo.note ?? '');
  const dirty = note !== (wo.note ?? '');
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <Input label="Not" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
      {dirty && (
        <Button variant="secondary" onClick={() => onSave(note.trim() || null)}>
          Kaydet
        </Button>
      )}
    </div>
  );
}

function Payments({ wo, onChange, isAdmin }: { wo: WorkOrder; onChange: (w: WorkOrder) => void; isAdmin: boolean }) {
  const balance = wo.balanceKurus ?? 0;
  const [amount, setAmount] = useState(balance > 0 ? kurusToInput(balance) : '');
  const [method, setMethod] = useState<PaymentMethod>('NAKIT');
  // Çift tıklama ve ağ yeniden denemesinde aynı anahtar gider; sunucu ikinci ödemeyi kaydetmez.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);

  // Kalem eklenip çıkarılınca önerilen tutar kalan bakiyeye güncellenir.
  useEffect(() => setAmount(balance > 0 ? kurusToInput(balance) : ''), [balance]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const kurus = parseTl(amount);
    if (!kurus) return setError('Geçerli bir tutar girin (ör. 250 veya 250,50)');
    if (kurus > balance) return setError(`Tutar kalan bakiyeyi (${formatTl(balance)}) aşamaz`);
    setSaving(true);
    setError(null);
    try {
      const updated = await api.workOrders.pay(wo.id, { amountKurus: kurus, method, idempotencyKey: key });
      onChange(updated);
      setKey(crypto.randomUUID());
      setAmount(updated.balanceKurus && updated.balanceKurus > 0 ? kurusToInput(updated.balanceKurus) : '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tahsilat kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Tahsilat"
      actions={
        isAdmin &&
        (wo.paidKurus ?? 0) > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setRefundOpen(true)}>
            İade
          </Button>
        )
      }
    >
      <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-slate-500">Ödenen</p>
          <p className="text-lg font-semibold tabular-nums">{formatTl(wo.paidKurus ?? 0)}</p>
        </div>
        <div className={`rounded-lg p-3 ${balance > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
          <p className={balance > 0 ? 'text-amber-700' : 'text-emerald-700'}>Kalan</p>
          <p className="text-lg font-semibold tabular-nums">{formatTl(balance)}</p>
        </div>
      </div>

      {wo.payments!.length > 0 && (
        <ul className="mb-3 divide-y divide-slate-100 text-sm">
          {wo.payments!.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{p.amountKurus < 0 ? 'İade' : METHOD_LABELS[p.method]}</span>
                <span className="text-slate-500">
                  {' '}
                  · {fmtDateTime(p.createdAt)} · {p.receivedBy.name}
                </span>
                {p.note && <span className="block text-xs text-slate-500">{p.note}</span>}
              </span>
              <span className={`tabular-nums ${p.amountKurus < 0 ? 'text-red-600' : ''}`}>{formatTl(p.amountKurus)}</span>
            </li>
          ))}
        </ul>
      )}

      {balance > 0 && wo.status !== 'CANCELLED' && (
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Ödeme yöntemi">
            {(['NAKIT', 'KART', 'HAVALE'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={`rounded-lg px-2 py-2 text-sm font-medium ring-1 ${method === m ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-slate-300'}`}
              >
                {METHOD_LABELS[m]}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input label="Tutar (₺)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-lg tabular-nums" />
            </div>
            <Button type="submit" size="lg" busy={saving}>
              Tahsil et
            </Button>
          </div>
          {error && <Alert>{error}</Alert>}
        </form>
      )}

      <RefundModal open={refundOpen} wo={wo} onClose={() => setRefundOpen(false)} onDone={(w) => (onChange(w), setRefundOpen(false))} />
    </Card>
  );
}

function RefundModal({ open, wo, onClose, onDone }: { open: boolean; wo: WorkOrder; onClose: () => void; onDone: (w: WorkOrder) => void }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('NAKIT');
  const [key] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const kurus = parseTl(amount);
    if (!kurus) return setError('Geçerli bir tutar girin');
    if (!note.trim()) return setError('İade nedeni zorunlu');
    setSaving(true);
    setError(null);
    try {
      onDone(await api.workOrders.pay(wo.id, { amountKurus: -kurus, method, note: note.trim(), idempotencyKey: key }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İade yapılamadı');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="İade" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-600">En fazla {formatTl(wo.paidKurus ?? 0)} iade edilebilir. İade kaydı silinemez.</p>
        <Input label="İade tutarı (₺)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Select label="Yöntem" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {(['NAKIT', 'KART', 'HAVALE'] as const).map((m) => (
            <option key={m} value={m}>
              {METHOD_LABELS[m]}
            </option>
          ))}
        </Select>
        <Input label="Neden" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" variant="danger" className="w-full" busy={saving}>
          İadeyi kaydet
        </Button>
      </form>
    </Modal>
  );
}

function AddItemsModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (items: { serviceId: string; quantity: number }[]) => void }) {
  const services = useAsync(() => (open ? api.services.list() : Promise.resolve([])), [open]);
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <Modal open={open} title="Hizmet ekle" onClose={onClose}>
      {services.loading ? (
        <Loading />
      ) : (
        <div className="space-y-2">
          {services.data?.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-2.5 ring-1 ring-slate-200 has-[:checked]:bg-brand-50 has-[:checked]:ring-brand-500">
              <input
                type="checkbox"
                checked={picked.includes(s.id)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))}
              />
              <span className="flex-1">{s.name}</span>
              <span className="text-sm tabular-nums text-slate-600">{formatTl(s.priceKurus)}</span>
            </label>
          ))}
          <Button
            className="mt-2 w-full"
            disabled={picked.length === 0}
            onClick={() => {
              onAdd(picked.map((serviceId) => ({ serviceId, quantity: 1 })));
              setPicked([]);
            }}
          >
            Ekle
          </Button>
        </div>
      )}
    </Modal>
  );
}
