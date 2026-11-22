// API'deki src/domain/money.ts ile aynı kurallar: tutarlar kuruş cinsinden tam sayı, float yok.

/** "125,50" / "125.50" / "125" -> 12550. Geçersizse null. */
export function parseTl(input: string): number | null {
  const m = /^\s*(\d{1,9})(?:[.,](\d{1,2}))?\s*$/.exec(input);
  if (!m) return null;
  return Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0);
}

/** 12550 -> "125,50 ₺" */
export function formatTl(kurus: number): string {
  const sign = kurus < 0 ? '-' : '';
  const abs = Math.abs(kurus);
  return `${sign}${Math.floor(abs / 100).toLocaleString('tr-TR')},${String(abs % 100).padStart(2, '0')} ₺`;
}

/** 12550 -> "125,50" (form alanı için) */
export function kurusToInput(kurus: number): string {
  return `${Math.floor(kurus / 100)},${String(kurus % 100).padStart(2, '0')}`;
}

export const vatLabel = (bp: number) => `%${(bp / 100).toLocaleString('tr-TR')}`;
