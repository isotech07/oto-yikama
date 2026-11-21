import type { WorkOrderStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { canTransition, isOpen } from './work-order-status';

const ALL: WorkOrderStatus[] = ['BEKLIYOR', 'YIKANIYOR', 'KURULANIYOR', 'HAZIR', 'TESLIM_EDILDI', 'CANCELLED'];
const ALLOWED = new Set([
  'BEKLIYOR>YIKANIYOR',
  'YIKANIYOR>KURULANIYOR',
  'KURULANIYOR>HAZIR',
  'HAZIR>TESLIM_EDILDI',
  'BEKLIYOR>CANCELLED',
  'YIKANIYOR>CANCELLED',
]);

describe('canTransition', () => {
  // 36 kombinasyonun tamamı: yalnızca izin verilen 6 geçiş true olmalı.
  for (const from of ALL) {
    for (const to of ALL) {
      const expected = ALLOWED.has(`${from}>${to}`);
      it(`${from} -> ${to}: ${expected ? 'izinli' : 'yasak'}`, () => {
        expect(canTransition(from, to)).toBe(expected);
      });
    }
  }
});

describe('isOpen', () => {
  it('teslim edilen ve iptal açık değildir', () => {
    expect(ALL.filter(isOpen)).toEqual(['BEKLIYOR', 'YIKANIYOR', 'KURULANIYOR', 'HAZIR']);
  });
});
