/** İşletme saat dilimi: Türkiye 2016'dan beri sabit UTC+3 (yaz saati yok). */
export const TR_OFFSET = '+03:00';

/** "YYYY-MM-DD" (İstanbul günü) -> [başlangıç, ertesi gün başlangıcı) UTC anları */
export function dayRange(from: string, to: string = from): { start: Date; end: Date } {
  const start = new Date(`${from}T00:00:00${TR_OFFSET}`);
  const endDay = new Date(`${to}T00:00:00${TR_OFFSET}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endDay.getTime())) throw new RangeError('Geçersiz tarih');
  if (endDay < start) throw new RangeError('Bitiş tarihi başlangıçtan önce olamaz');
  return { start, end: new Date(endDay.getTime() + 24 * 60 * 60 * 1000) };
}

/** Verilen anın İstanbul takvim günü "YYYY-MM-DD" */
export function trDate(d: Date = new Date()): string {
  return new Date(d.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
