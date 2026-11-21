/**
 * Tüm tutarlar kuruş cinsinden tam sayıdır. KDV oranı baz puandır (%20 = 2000).
 * Fiyatlar KDV dahil girilir (perakende pratiği); KDV tutarı içinden ayrıştırılır.
 */

function assertInt(name: string, v: number) {
  if (!Number.isSafeInteger(v)) throw new RangeError(`${name} tam sayı olmalı: ${v}`);
}

/** Yarıyı sıfırdan uzağa yuvarlayan tam sayı bölmesi (pozitif/negatif simetrik). */
function divRound(numerator: number, denominator: number): number {
  const sign = Math.sign(numerator) * Math.sign(denominator) || 1;
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  return sign * Math.floor((2 * n + d) / (2 * d));
}

/** KDV dahil tutarın içindeki KDV payı. */
export function vatFromGross(grossKurus: number, vatRateBp: number): number {
  assertInt('grossKurus', grossKurus);
  assertInt('vatRateBp', vatRateBp);
  if (vatRateBp < 0 || vatRateBp > 10000) throw new RangeError('KDV oranı 0-10000 bp aralığında olmalı');
  return grossKurus - divRound(grossKurus * 10000, 10000 + vatRateBp);
}

export interface LineInput {
  unitPrice: number; // KDV dahil, kuruş
  quantity: number;
  vatRateBp: number;
}

export interface Totals {
  grossKurus: number;
  vatKurus: number;
  netKurus: number;
}

/** Satır bazında KDV hesaplanıp toplanır (her satır fişte ayrı göründüğü için). */
export function computeTotals(lines: LineInput[]): Totals {
  let gross = 0;
  let vat = 0;
  for (const l of lines) {
    assertInt('unitPrice', l.unitPrice);
    assertInt('quantity', l.quantity);
    if (l.quantity <= 0) throw new RangeError('Adet pozitif olmalı');
    const lineGross = l.unitPrice * l.quantity;
    gross += lineGross;
    vat += vatFromGross(lineGross, l.vatRateBp);
  }
  return { grossKurus: gross, vatKurus: vat, netKurus: gross - vat };
}

/** "125,50" / "125.50" / "125" -> 12550. Geçersizse null. Float kullanılmaz. */
export function parseTl(input: string): number | null {
  const m = /^\s*(\d{1,9})(?:[.,](\d{1,2}))?\s*$/.exec(input);
  if (!m) return null;
  const lira = Number(m[1]);
  const kurus = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  return lira * 100 + kurus;
}

/** 12550 -> "125,50 ₺" (tr-TR) */
export function formatTl(kurus: number): string {
  assertInt('kurus', kurus);
  const sign = kurus < 0 ? '-' : '';
  const abs = Math.abs(kurus);
  const lira = Math.floor(abs / 100).toLocaleString('tr-TR');
  const k = String(abs % 100).padStart(2, '0');
  return `${sign}${lira},${k} ₺`;
}
