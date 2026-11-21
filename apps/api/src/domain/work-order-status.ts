import type { WorkOrderStatus } from '@prisma/client';

const TRANSITIONS: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  BEKLIYOR: ['YIKANIYOR', 'CANCELLED'],
  YIKANIYOR: ['KURULANIYOR', 'CANCELLED'],
  KURULANIYOR: ['HAZIR'],
  HAZIR: ['TESLIM_EDILDI'],
  TESLIM_EDILDI: [],
  CANCELLED: [],
};

export const OPEN_STATUSES: readonly WorkOrderStatus[] = ['BEKLIYOR', 'YIKANIYOR', 'KURULANIYOR', 'HAZIR'];

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedNextStatuses(from: WorkOrderStatus): readonly WorkOrderStatus[] {
  return TRANSITIONS[from];
}

export function isOpen(status: WorkOrderStatus): boolean {
  return OPEN_STATUSES.includes(status);
}
