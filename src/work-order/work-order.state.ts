import { ConflictException } from '@nestjs/common';
import type { WorkOrderStatus } from '../generated/prisma/enums.js';

// Aturan perpindahan status biaya Work Order (satu-satunya tempat aturan ini ditulis).
//
//   OPEN --check--> COST_CHECKED --approve--> COST_APPROVED
//   COST_CHECKED --reject--> OPEN         (ditolak pemeriksa/penyetuju)
//   COST_APPROVED --revert--> OPEN        (dikembalikan oleh penyetuju)
export type CostAction = 'check' | 'approve' | 'reject' | 'revert';

export const COST_TRANSITIONS: Record<
  CostAction,
  { from: readonly WorkOrderStatus[]; to: WorkOrderStatus }
> = {
  check: { from: ['OPEN'], to: 'COST_CHECKED' },
  approve: { from: ['COST_CHECKED'], to: 'COST_APPROVED' },
  reject: { from: ['COST_CHECKED'], to: 'OPEN' },
  revert: { from: ['COST_APPROVED'], to: 'OPEN' },
};

export function assertCostTransition(action: CostAction, current: WorkOrderStatus) {
  const rule = COST_TRANSITIONS[action];
  if (!rule.from.includes(current)) {
    throw new ConflictException(
      `Aksi ini hanya dapat dilakukan saat status ${rule.from.join(' / ')}. Status saat ini: ${current}`,
    );
  }
  return rule;
}
