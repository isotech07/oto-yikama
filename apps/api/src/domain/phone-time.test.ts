import { describe, expect, it } from 'vitest';
import { formatPhone, normalizePhone } from './phone';
import { dayRange, trDate } from './time';

describe('normalizePhone', () => {
  it.each([
    ['0532 123 45 67', '5321234567'],
    ['+90 (532) 123-45-67', '5321234567'],
    ['5321234567', '5321234567'],
    ['0212 555 11 22', '2125551122'],
  ])('%s', (i, o) => expect(normalizePhone(i)).toBe(o));
  it.each(['', '123', '0532 123 45', '1234567890', '05321234567890'])('geçersiz %j', (i) =>
    expect(normalizePhone(i)).toBeNull(),
  );
  it('formatPhone', () => expect(formatPhone('5321234567')).toBe('0532 123 45 67'));
});

describe('dayRange / trDate', () => {
  it('İstanbul günü UTC 21:00 - 21:00 aralığıdır', () => {
    const { start, end } = dayRange('2026-11-22');
    expect(start.toISOString()).toBe('2026-11-21T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-22T21:00:00.000Z');
  });
  it('çok günlü aralık bitiş gününü kapsar', () => {
    const { start, end } = dayRange('2026-11-01', '2026-11-30');
    expect((end.getTime() - start.getTime()) / 86400000).toBe(30);
  });
  it('ters aralık hata verir', () => expect(() => dayRange('2026-11-02', '2026-11-01')).toThrow());
  it('UTC 22:30 İstanbul\'da ertesi gündür', () => {
    expect(trDate(new Date('2026-11-21T22:30:00Z'))).toBe('2026-11-22');
  });
});
