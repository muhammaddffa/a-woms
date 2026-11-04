import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/types/auth.types.js';
import { Prisma } from '../generated/prisma/client.js';
import type { ApprovalDocType, ApprovalStep } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateWorkflowSettingDto } from './dto/workflow-setting.dto.js';

// Hanya langkah PENGECEKAN yang dapat diatur. Langkah inti (setujui, bayar, ajukan LPJ,
// setujui LPJ) tetap di kode agar kontrol keuangan tidak bisa dimatikan dari UI.
export const CONFIGURABLE_STEPS: Record<ApprovalDocType, readonly ApprovalStep[]> = {
  WORK_ORDER_COST: [],
  CASH_ADVANCE: ['CHECK', 'VERIFY_TRANSFER', 'REPORT_CHECK'],
  ADVANCE_RETURN: [],
};

@Injectable()
export class WorkflowSettingService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.workflowSetting.findMany({
      select: {
        id: true,
        docType: true,
        step: true,
        isEnabled: true,
        minAmount: true,
        updatedAt: true,
        updatedBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ docType: 'asc' }, { step: 'asc' }],
    });
  }

  // Langkah pengecekan yang berlaku untuk sebuah dokumen bernilai `total`.
  // Tanpa baris pengaturan, langkah dianggap aktif (default aman).
  async resolveRequiredSteps(
    db: Pick<Prisma.TransactionClient, 'workflowSetting'>,
    docType: ApprovalDocType,
    total: Prisma.Decimal | number | string,
  ): Promise<ApprovalStep[]> {
    const amount = new Prisma.Decimal(total);
    const rows = await db.workflowSetting.findMany({ where: { docType } });
    const byStep = new Map(rows.map((r) => [r.step, r]));
    return CONFIGURABLE_STEPS[docType].filter((step) => {
      const row = byStep.get(step);
      return row ? row.isEnabled && amount.gte(row.minAmount) : true;
    });
  }

  async update(actor: AuthUser, docType: ApprovalDocType, step: ApprovalStep, dto: UpdateWorkflowSettingDto) {
    if (!CONFIGURABLE_STEPS[docType].includes(step)) {
      throw new BadRequestException('Langkah ini tidak dapat diatur');
    }
    return this.prisma.$transaction(async (tx) => {
      const key = { docType_step: { docType, step } };
      const current = await tx.workflowSetting.findUnique({ where: key });
      const before = {
        isEnabled: current?.isEnabled ?? true,
        minAmount: current?.minAmount ?? new Prisma.Decimal(0),
      };
      const after = {
        isEnabled: dto.isEnabled ?? before.isEnabled,
        minAmount: dto.minAmount !== undefined ? new Prisma.Decimal(dto.minAmount) : before.minAmount,
      };
      const saved = await tx.workflowSetting.upsert({
        where: key,
        update: { ...after, updatedById: actor.id },
        create: { docType, step, ...after, updatedById: actor.id },
        select: { id: true, docType: true, step: true, isEnabled: true, minAmount: true, updatedAt: true },
      });
      await tx.workflowSettingLog.create({
        data: {
          settingId: saved.id,
          oldValue: { isEnabled: before.isEnabled, minAmount: before.minAmount.toString() },
          newValue: { isEnabled: after.isEnabled, minAmount: after.minAmount.toString() },
          changedById: actor.id,
        },
      });
      return saved;
    });
  }
}
