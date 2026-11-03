import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import type {
  ApprovalAction,
  ApprovalDocType,
  ApprovalStep,
} from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Permission yang diperlukan untuk MELIHAT riwayat tiap jenis dokumen.
const VIEW_PERMISSION: Record<ApprovalDocType, string> = {
  WORK_ORDER_COST: PERMISSIONS.WORK_ORDER_VIEW.code,
  CASH_ADVANCE: PERMISSIONS.CASH_ADVANCE_VIEW.code,
  ADVANCE_RETURN: PERMISSIONS.CASH_ADVANCE_VIEW.code,
};

export interface ApprovalEntry {
  docType: ApprovalDocType;
  docId: string;
  step: ApprovalStep;
  action: ApprovalAction;
  actorId: string;
  note?: string | null;
}

@Injectable()
export class ApprovalService {
  constructor(private readonly prisma: PrismaService) {}

  // Dipanggil di dalam transaksi yang sama dengan perubahan status dokumen,
  // sehingga status dan riwayatnya selalu konsisten.
  record(tx: Prisma.TransactionClient, entry: ApprovalEntry) {
    return tx.approvalHistory.create({
      data: {
        docType: entry.docType,
        docId: entry.docId,
        step: entry.step,
        action: entry.action,
        actorId: entry.actorId,
        note: entry.note ?? null,
      },
    });
  }

  async list(actor: AuthUser, docType: ApprovalDocType, docId: string) {
    if (!actor.permissions.includes(VIEW_PERMISSION[docType])) {
      throw new ForbiddenException('Anda tidak memiliki akses untuk tindakan ini');
    }
    return this.prisma.approvalHistory.findMany({
      where: { docType, docId },
      select: {
        id: true,
        step: true,
        action: true,
        note: true,
        actedAt: true,
        actor: { select: { id: true, fullName: true } },
      },
      orderBy: [{ actedAt: 'asc' }, { id: 'asc' }],
    });
  }
}
