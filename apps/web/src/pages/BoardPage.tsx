import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Alert, Button, Empty, Input, Loading, PageHeader, StatusBadge } from '../components/ui';
import { api, type WorkOrder, type WorkOrderStatus } from '../lib/api';
import { displayPlate, elapsed, fmtDateTime, STATUS_ACTIONS, STATUS_LABELS, todayTr } from '../lib/format';
import { formatTl } from '../lib/money';
import { useAsync } from '../lib/useAsync';

const COLUMNS: WorkOrderStatus[] = ['BEKLIYOR', 'YIKANIYOR', 'KURULANIYOR', 'HAZIR'];

export function BoardPage() {
  const [tab, setTab] = useState<'open' | 'history'>('open');
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title={user?.role === 'WORKER' ? 'Bana atanan işler' : 'İş Emirleri'}
        actions={
          <>
            <div className="flex rounded-lg bg-slate-100 p-1 text-sm" role="tablist">
              {(['open', 'history'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`rounded-md px-3 py-1.5 font-medium ${tab === t ? 'bg-white shadow-sm' : 'text-slate-600'}`}
                >
                  {t === 'open' ? 'Açık' : 'Geçmiş'}
                </button>
              ))}
            </div>
            {user?.role !== 'WORKER' && <Button onClick={() => navigate('/yeni')}>+ Yeni iş emri</Button>}
          </>
        }
      />
      {tab === 'open' ? <OpenBoard /> : <History />}
    </>
  );
}

function OpenBoard() {
  const { user } = useAuth();
  const { data, error, loading, reload, setData } = useAsync(() => api.workOrders.list({ scope: 'open', pageSize: 100 }), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, tick] = useState(0);

  // Pano 15 sn'de bir sessizce yenilenir (diğer kasa/personel değişiklikleri).
  useEffect(() => {
    const t = setInterval(() => {
      void reload(true);
      tick((x) => x + 1);
    }, 15_000);
    return () => clearInterval(t);
  }, [reload]);

  async function advance(wo: WorkOrder, to: WorkOrderStatus) {
    setBusy(wo.id);
    setActionError(null);
    try {
      const updated = await api.workOrders.status(wo.id, to);
      setData((d) => d && { ...d, items: d.items.map((x) => (x.id === wo.id ? updated : x)) });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'İşlem yapılamadı');
      void reload(true);
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  const orders = data?.items ?? [];

  if (orders.length === 0)
    return <Empty>{user?.role === 'WORKER' ? 'Size atanmış açık iş yok.' : 'Şu an açık iş emri yok.'}</Empty>;

  return (
    <div className="space-y-3">
      {actionError && <Alert>{actionError}</Alert>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => o.status === col);
          return (
            <section key={col} aria-label={STATUS_LABELS[col]} className="rounded-xl bg-slate-100/70 p-2">
              <h2 className="flex items-center justify-between px-2 py-1.5 text-sm font-semibold text-slate-700">
                {STATUS_LABELS[col]}
                <span className="rounded-full bg-white px-2 text-xs text-slate-500">{list.length}</span>
              </h2>
              <div className="space-y-2">
                {list.map((wo) => (
                  <OrderCard key={wo.id} wo={wo} busy={busy === wo.id} onAdvance={advance} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function OrderCard({ wo, busy, onAdvance }: { wo: WorkOrder; busy: boolean; onAdvance: (wo: WorkOrder, to: WorkOrderStatus) => void }) {
  const forward = wo.allowedNext.filter((s) => s !== 'CANCELLED');
  return (
    <article className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <Link to={`/is/${wo.id}`} className="block">
        <div className="flex items-start justify-between gap-2">
          <p className="font-mono text-lg font-semibold tracking-wide">{displayPlate(wo.vehicle.plate)}</p>
          <span className="whitespace-nowrap text-xs text-slate-500">{elapsed(wo.createdAt)}</span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{wo.items.map((i) => i.serviceName).join(', ')}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>👤 {wo.assignedWorker?.name ?? <em className="text-amber-700">Atanmadı</em>}</span>
          {wo.balanceKurus !== null && (
            <span className={wo.balanceKurus > 0 ? 'font-medium text-amber-700' : 'text-emerald-700'}>
              {wo.balanceKurus > 0 ? `Kalan ${formatTl(wo.balanceKurus)}` : 'Ödendi'}
            </span>
          )}
        </div>
        {wo.note && <p className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">📝 {wo.note}</p>}
      </Link>
      {forward.length > 0 && (
        <div className="mt-2.5 flex gap-2">
          {forward.map((to) => (
            <Button
              key={to}
              size="sm"
              variant={to === 'TESLIM_EDILDI' ? 'success' : 'primary'}
              className="flex-1"
              busy={busy}
              onClick={() => onAdvance(wo, to)}
            >
              {STATUS_ACTIONS[to]}
            </Button>
          ))}
        </div>
      )}
      {wo.status === 'HAZIR' && wo.balanceKurus !== null && wo.balanceKurus > 0 && (
        <Link to={`/is/${wo.id}`} className="mt-2 block text-center text-sm font-medium text-brand-700">
          Tahsilat al →
        </Link>
      )}
    </article>
  );
}

function History() {
  const [date, setDate] = useState(todayTr());
  const [plate, setPlate] = useState('');
  const [page, setPage] = useState(1);
  const [unpaid, setUnpaid] = useState(false);
  const { user } = useAuth();
  const { data, error, loading } = useAsync(
    () =>
      api.workOrders.list({
        scope: unpaid ? 'unpaid' : 'all',
        date: plate || unpaid ? undefined : date,
        plate: plate || undefined,
        page,
        pageSize: 25,
      }),
    [date, plate, page, unpaid],
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 md:max-w-xl">
        <Input label="Tarih" type="date" value={date} onChange={(e) => (setDate(e.target.value), setPage(1))} disabled={!!plate} />
        <Input label="Plaka ara" placeholder="34ABC" value={plate} onChange={(e) => (setPlate(e.target.value), setPage(1))} hint="Plaka girilirse tüm tarihler aranır" />
      </div>
      {user?.role !== 'WORKER' && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={unpaid} onChange={(e) => (setUnpaid(e.target.checked), setPage(1))} /> Yalnız borcu kalan (veresiye) teslimler
        </label>
      )}
      {error && <Alert>{error}</Alert>}
      {loading && !data ? (
        <Loading />
      ) : data && data.items.length === 0 ? (
        <Empty>Kayıt bulunamadı.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <ul className="divide-y divide-slate-100">
            {data?.items.map((wo) => (
              <li key={wo.id}>
                <Link to={`/is/${wo.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono font-semibold">{displayPlate(wo.vehicle.plate)}</p>
                    <p className="truncate text-sm text-slate-500">
                      {fmtDateTime(wo.createdAt)} · {wo.items.map((i) => i.serviceName).join(', ')}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={wo.status} />
                    <p className="mt-1 text-sm tabular-nums text-slate-700">{formatTl(wo.totals.grossKurus)}</p>
                    {wo.status === 'TESLIM_EDILDI' && (wo.balanceKurus ?? 0) > 0 && (
                      <p className="text-xs font-medium text-amber-700">Borç {formatTl(wo.balanceKurus!)}</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
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
    </div>
  );
}
