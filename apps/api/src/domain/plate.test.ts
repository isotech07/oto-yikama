import { describe, expect, it } from 'vitest';
import { maskPlate, normalizePlate } from './plate';

describe('normalizePlate', () => {
  it.each([
    ['34 abc 123', '34ABC123'],
    ['  06-ab-1234 ', '06AB1234'],
    ['35.zz.99', '35ZZ99'],
    ['34 ibi 12', '34IBI12'], // Türkçe "i" -> "İ" olmamalı, "I" olmalı
  ])('%s -> %s', (input, expected) => {
    expect(normalizePlate(input)).toBe(expected);
  });

  it.each(['', ' ', 'A', '34ÇŞ123', '34 ABC 123 !', '1234567890123'])('geçersiz: %j', (input) => {
    expect(normalizePlate(input)).toBeNull();
  });
});

describe('maskPlate', () => {
  it('ortadaki karakterleri gizler', () => {
    expect(maskPlate('34ABC123')).toBe('34*****3');
  });
});
