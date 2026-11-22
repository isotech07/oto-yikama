import type { PaymentMethod, Role, WorkOrderStatus } from './api';

export const ROLE_LABELS: Record<Role, string> = { ADMIN: 'Yönetici', CASHIER: 'Kasiyer', WORKER: 'Personel' };

export const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  BEKLIYOR: 'Bekliyor',
  YIKANIYOR: 'Yıkanıyor',
  KURULANIYOR: 'Kurulanıyor',
  HAZIR: 'Hazır',
  TESLIM_EDILDI: 'Teslim edildi',
  CANCELLED: 'İptal',
};

/** Durum düğmesinde görünen eylem adı */
export const STATUS_ACTIONS: Record<WorkOrderStatus, string> = {
  BEKLIYOR: 'Beklemeye al',
  YIKANIYOR: 'Yıkamaya başla',
  KURULANIYOR: 'Kurulamaya geç',
  HAZIR: 'Hazır',
  TESLIM_EDILDI: 'Teslim et',
  CANCELLED: 'İptal et',
};

export const STATUS_STYLES: Record<WorkOrderStatus, string> = {
  BEKLIYOR: 'bg-amber-100 text-amber-800 ring-amber-200',
  YIKANIYOR: 'bg-sky-100 text-sky-800 ring-sky-200',
  KURULANIYOR: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  HAZIR: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  TESLIM_EDILDI: 'bg-slate-100 text-slate-700 ring-slate-200',
  CANCELLED: 'bg-red-50 text-red-700 ring-red-200',
};

export const METHOD_LABELS: Record<PaymentMethod, string> = { NAKIT: 'Nakit', KART: 'Kart', HAVALE: 'Havale/EFT' };

/** "34ABC123" -> "34 ABC 123" (yalnızca görünüm) */
export function displayPlate(p: string): string {
  const m = /^(\d{2})([A-Z]{1,3})(\d{2,5})$/.exec(p);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : p;
}

export function displayPhone(p: string | null | undefined): string {
  if (!p) return '';
  return `0${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6, 8)} ${p.slice(8)}`;
}

const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
const dateTimeFmt = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Istanbul',
});
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));
export const fmtDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));

export function elapsed(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} dk`;
  return `${Math.floor(min / 60)} sa ${min % 60} dk`;
}

/** İstanbul takvim günü "YYYY-MM-DD" */
export function todayTr(): string {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}
