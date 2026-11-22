import { describe, expect, it } from 'vitest';
import { formatTl, kurusToInput, parseTl, vatLabel } from './money';
import { displayPhone, displayPlate, elapsed } from './format';

describe('para (web)', () => {
  it.each([
    ['250', 25000],
    ['250,5', 25050],
    ['250.50', 25050],
    [' 0,01 ', 1],
  ])('parseTl(%j) = %i', (s, k) => expect(parseTl(s)).toBe(k));
  it.each(['', '-5', '1.234,56', 'abc', '1,234'])('parseTl geçersiz %j', (s) => expect(parseTl(s)).toBeNull());
  it('formatTl / kurusToInput / vatLabel', () => {
    expect(formatTl(150000)).toBe('1.500,00 ₺');
    expect(formatTl(-2500)).toBe('-25,00 ₺');
    expect(kurusToInput(25005)).toBe('250,05');
    expect(parseTl(kurusToInput(98765))).toBe(98765);
    expect(vatLabel(2000)).toBe('%20');
    expect(vatLabel(150)).toBe('%1,5');
  });
});

describe('biçimlendirme', () => {
  it('plaka ve telefon', () => {
    expect(displayPlate('34ABC123')).toBe('34 ABC 123');
    expect(displayPlate('T12345678')).toBe('T12345678');
    expect(displayPhone('5321234567')).toBe('0532 123 45 67');
  });
  it('geçen süre', () => {
    const now = Date.parse('2026-11-22T10:00:00Z');
    expect(elapsed('2026-11-22T09:35:00Z', now)).toBe('25 dk');
    expect(elapsed('2026-11-22T08:20:00Z', now)).toBe('1 sa 40 dk');
  });
});
