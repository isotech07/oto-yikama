import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { Alert, Button, Loading } from '../components/ui';
import { api } from '../lib/api';
import { displayPlate, fmtDateTime, METHOD_LABELS } from '../lib/format';
import { formatTl, vatLabel } from '../lib/money';
import { useAsync } from '../lib/useAsync';

/** 80 mm termal yazıcıya uygun bilgi fişi. Resmî belge değildir. */
export function ReceiptPage() {
  const { id = '' } = useParams();
  const { data, error, loading } = useAsync(() => Promise.all([api.workOrders.get(id), api.settings.get()]), [id]);

  useEffect(() => {
    document.body.classList.add('receipt-mode');
    return () => document.body.classList.remove('receipt-mode');
  }, []);

  if (loading) return <Loading />;
  if (error || !data) return <Alert>{error ?? 'Bulunamadı'}</Alert>;
  const [wo, s] = data;

  // KDV oranına göre döküm
  const byRate = new Map<number, number>();
  for (const i of wo.items) if (i.lineTotal > 0) byRate.set(i.vatRateBp, (byRate.get(i.vatRateBp) ?? 0) + i.lineTotal);

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-4 flex gap-2 print:hidden">
        <Link to={`/is/${wo.id}`} className="rounded-lg px-3 py-2 text-sm ring-1 ring-slate-300">
          ← Geri
        </Link>
        <Button onClick={() => window.print()} className="flex-1">
          Yazdır
        </Button>
      </div>
      <article className="receipt bg-white p-4 font-mono text-[12px] leading-snug text-black shadow-sm ring-1 ring-slate-200 print:p-0 print:shadow-none print:ring-0">
        <header className="text-center">
          <p className="text-sm font-bold">{s.name}</p>
          {s.address && <p>{s.address}</p>}
          {s.phone && <p>Tel: {s.phone}</p>}
          {(s.taxOffice || s.taxNumber) && (
            <p>
              {s.taxOffice} {s.taxNumber && `V.No: ${s.taxNumber}`}
            </p>
          )}
        </header>
        <hr className="my-2 border-dashed border-black" />
        <p className="text-center font-bold">BİLGİ FİŞİ</p>
        <p className="text-center">*** MALİ DEĞERİ YOKTUR ***</p>
        <hr className="my-2 border-dashed border-black" />
        <p>Plaka : {displayPlate(wo.vehicle.plate)}</p>
        {wo.customer && <p>Müşteri: {wo.customer.name}</p>}
        <p>Tarih : {fmtDateTime(wo.deliveredAt ?? wo.createdAt)}</p>
        <p>Fiş No: {wo.id.slice(0, 8).toUpperCase()}</p>
        <hr className="my-2 border-dashed border-black" />
        {wo.items.map((i) => (
          <div key={i.id}>
            <p>{i.serviceName}</p>
            <p className="flex justify-between">
              <span>
                {i.quantity} x {formatTl(i.unitPrice)} %{i.vatRateBp / 100}
              </span>
              <span>{formatTl(i.lineTotal)}</span>
            </p>
          </div>
        ))}
        <hr className="my-2 border-dashed border-black" />
        {[...byRate].map(([rate, gross]) => (
          <p key={rate} className="flex justify-between">
            <span>KDV {vatLabel(rate)} matrah</span>
            <span>{formatTl(Math.round((gross * 10000) / (10000 + rate)))}</span>
          </p>
        ))}
        <p className="flex justify-between">
          <span>Toplam KDV</span>
          <span>{formatTl(wo.totals.vatKurus)}</span>
        </p>
        <p className="flex justify-between text-sm font-bold">
          <span>TOPLAM</span>
          <span>{formatTl(wo.totals.grossKurus)}</span>
        </p>
        {wo.payments && wo.payments.length > 0 && (
          <>
            <hr className="my-2 border-dashed border-black" />
            {wo.payments.map((p) => (
              <p key={p.id} className="flex justify-between">
                <span>{p.amountKurus < 0 ? 'İade' : METHOD_LABELS[p.method]}</span>
                <span>{formatTl(p.amountKurus)}</span>
              </p>
            ))}
            {(wo.balanceKurus ?? 0) > 0 && (
              <p className="flex justify-between font-bold">
                <span>KALAN BORÇ</span>
                <span>{formatTl(wo.balanceKurus!)}</span>
              </p>
            )}
          </>
        )}
        {s.receiptFooter && (
          <>
            <hr className="my-2 border-dashed border-black" />
            <p className="text-center">{s.receiptFooter}</p>
          </>
        )}
      </article>
    </div>
  );
}
