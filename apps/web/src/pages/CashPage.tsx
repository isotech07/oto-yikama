import { type FormEvent, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Alert, Button, Card, Input, Loading, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime, todayTr } from '../lib/format';
import { formatTl, parseTl } from '../lib/money';
import { useAsync } from '../lib/useAsync';

export function CashPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [date, setDate] = useState(todayTr());
  const preview = useAsync(() => api.cash.preview(date), [date]);
  const history = useAsync(() => (isAdmin ? api.cash.list() : Promise.resolve([])), [isAdmin]);

  const [opening, setOpening] = useState('');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const p = preview.data;
  const openingK = parseTl(opening || '0');
  const countedK = counted ? parseTl(counted) : null;
  const expected = p && openingK !== null ? openingK + p.cashInKurus : null;
  const diff = expected !== null && countedK !== null ? countedK - expected : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (openingK === null || countedK === null) return setError('Tutarları kontrol edin (ör. 1500 veya 1500,50)');
    if (diff !== 0 && !note.trim()) return setError('Kasa farkı varsa açıklama zorunlu');
    if (!confirm('Kapanıştan sonra bu güne nakit işlem yapılamaz. Onaylıyor musunuz?')) return;
    setSaving(true);
    setError(null);
    try {
      await api.cash.close({ date, openingFloatKurus: openingK, countedKurus: countedK, note: note.trim() || null });
      await Promise.all([preview.reload(), history.reload()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Gün sonu kasa" />
      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <Card title="Kapanış">
          {isAdmin && (
            <div className="mb-3">
              <Input label="Gün" type="date" value={date} max={todayTr()} onChange={(e) => setDate(e.target.value)} />
            </div>
          )}
          {preview.loading && !p ? (
            <Loading />
          ) : preview.error ? (
            <Alert>{preview.error}</Alert>
          ) : p?.closing ? (
            <div className="space-y-2 text-sm">
              <Alert tone="info">
                Bu gün {fmtDateTime(p.closing.createdAt)} tarihinde {p.closing.closedBy.name} tarafından kapatıldı.
              </Alert>
              <Line label="Kasa başı" value={p.closing.openingFloatKurus} />
              <Line label="Nakit tahsilat" value={p.closing.cashInKurus} />
              <Line label="Beklenen" value={p.closing.expectedKurus} bold />
              <Line label="Sayılan" value={p.closing.countedKurus} />
              <Line label="Fark" value={p.closing.differenceKurus} bold tone />
              {p.closing.note && <p className="text-slate-600">Not: {p.closing.note}</p>}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <Input label="Kasa başı para (₺)" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" hint="Güne başlarken kasada bırakılan bozuk para" />
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <Line label="Bugünkü nakit tahsilat (iade düşülmüş)" value={p?.cashInKurus ?? 0} />
                {expected !== null && <Line label="Kasada olması gereken" value={expected} bold />}
              </div>
              <Input label="Sayılan nakit (₺)" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} className="text-lg tabular-nums" />
              {diff !== null && (
                <p className={`text-sm font-medium ${diff === 0 ? 'text-emerald-700' : 'text-red-700'}`} role="status">
                  {diff === 0 ? 'Kasa tutuyor ✓' : `Fark: ${formatTl(diff)} (${diff > 0 ? 'fazla' : 'eksik'})`}
                </p>
              )}
              <Input label={diff ? 'Fark açıklaması (zorunlu)' : 'Not'} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              {error && <Alert>{error}</Alert>}
              <Button type="submit" className="w-full" busy={saving} disabled={countedK === null}>
                Günü kapat
              </Button>
            </form>
          )}
        </Card>

        {isAdmin && (
          <Card title="Geçmiş kapanışlar">
            {history.loading ? (
              <Loading />
            ) : history.data?.length === 0 ? (
              <p className="text-sm text-slate-500">Henüz kapanış yok.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-500">
                    <tr>
                      <th className="pb-2 font-medium">Gün</th>
                      <th className="pb-2 text-right font-medium">Beklenen</th>
                      <th className="pb-2 text-right font-medium">Sayılan</th>
                      <th className="pb-2 text-right font-medium">Fark</th>
                      <th className="pb-2 pl-3 font-medium">Kapatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {history.data?.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2">{c.businessDate.slice(0, 10)}</td>
                        <td className="py-2 text-right tabular-nums">{formatTl(c.expectedKurus)}</td>
                        <td className="py-2 text-right tabular-nums">{formatTl(c.countedKurus)}</td>
                        <td className={`py-2 text-right tabular-nums ${c.differenceKurus ? 'font-medium text-red-700' : 'text-emerald-700'}`}>
                          {formatTl(c.differenceKurus)}
                        </td>
                        <td className="py-2 pl-3" title={c.note ?? ''}>
                          {c.closedBy.name}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

function Line({ label, value, bold, tone }: { label: string; value: number; bold?: boolean; tone?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? 'font-semibold' : ''} ${tone ? (value === 0 ? 'text-emerald-700' : 'text-red-700') : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{formatTl(value)}</span>
    </div>
  );
}
