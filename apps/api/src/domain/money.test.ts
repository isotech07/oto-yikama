import { describe, expect, it } from 'vitest';
import { computeTotals, formatTl, parseTl, vatFromGross } from './money';

describe('vatFromGross (KDV dahil fiyattan KDV ayrıştırma)', () => {
  it('%20 KDV: 120,00 TL içinde 20,00 TL KDV', () => {
    expect(vatFromGross(12000, 2000)).toBe(2000);
  });
  it('%20 KDV: 250,00 TL içinde 41,67 TL KDV (yuvarlama)', () => {
    // 25000 / 1.2 = 20833.33 -> net 20833, KDV 4167
    expect(vatFromGross(25000, 2000)).toBe(4167);
  });
  it('%0 KDV', () => {
    expect(vatFromGross(9999, 0)).toBe(0);
  });
  it('negatif tutarda (iade) simetrik', () => {
    expect(vatFromGross(-25000, 2000)).toBe(-4167);
  });
  it('tam sayı olmayan tutarı reddeder', () => {
    expect(() => vatFromGross(10.5, 2000)).toThrow(RangeError);
  });
  it('geçersiz oranı reddeder', () => {
    expect(() => vatFromGross(100, 10001)).toThrow(RangeError);
  });
});

describe('computeTotals', () => {
  it('satır bazında toplar, brüt = net + KDV', () => {
    const t = computeTotals([
      { unitPrice: 25000, quantity: 1, vatRateBp: 2000 },
      { unitPrice: 30000, quantity: 2, vatRateBp: 2000 },
    ]);
    expect(t.grossKurus).toBe(85000);
    expect(t.vatKurus).toBe(4167 + 10000);
    expect(t.netKurus + t.vatKurus).toBe(t.grossKurus);
  });
  it('boş liste sıfır', () => {
    expect(computeTotals([])).toEqual({ grossKurus: 0, vatKurus: 0, netKurus: 0 });
  });
  it('sıfır adedi reddeder', () => {
    expect(() => computeTotals([{ unitPrice: 100, quantity: 0, vatRateBp: 0 }])).toThrow();
  });
});

describe('parseTl / formatTl', () => {
  it.each([
    ['125,50', 12550],
    ['125.5', 12550],
    ['125', 12500],
    ['0,05', 5],
  ])('parseTl(%s) = %i', (s, k) => expect(parseTl(s)).toBe(k));

  it.each(['', 'abc', '1,234', '-5', '12,345'])('parseTl geçersiz: %j', (s) => expect(parseTl(s)).toBeNull());

  it('0.1 + 0.2 sorunu yok: 0,10 + 0,20 = 0,30', () => {
    expect(parseTl('0,10')! + parseTl('0,20')!).toBe(parseTl('0,30'));
  });

  it('formatTl', () => {
    expect(formatTl(12550)).toBe('125,50 ₺');
    expect(formatTl(123456789)).toBe('1.234.567,89 ₺');
    expect(formatTl(-5)).toBe('-0,05 ₺');
  });
});
