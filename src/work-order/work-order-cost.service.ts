import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalService } from '../approval/approval.service.js';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import type { ApprovalAction, ApprovalStep } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertCostTransition, type CostAction } from './work-order.state.js';
import { WorkOrderService } from './work-order.service.js';

@Injectable()
export class WorkOrderCostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalService,
    private readonly workOrders: WorkOrderService,
  ) {}

  check(actor: AuthUser, id: string, note?: string) {
    return this.transition(actor, id, 'check', note);
  }

  approve(actor: AuthUser, id: string, note?: string) {
    return this.transition(actor, id, 'approve', note);
  }

  reject(actor: AuthUser, id: string, reason: string) {
    return this.transition(actor, id, 'reject', reason);
  }

  revert(actor: AuthUser, id: string, reason: string) {
    return this.transition(actor, id, 'revert', reason);
  }

  async history(actor: AuthUser, id: string) {
    await this.loadWorkOrder(id);
    return this.approvals.list(actor, 'WORK_ORDER_COST', id);
  }

  // ---------------------------------------------------------------

  private async transition(actor: AuthUser, id: string, action: CostAction, note?: string) {
    const wo = await this.loadWorkOrder(id);
    const rule = assertCostTransition(action, wo.status);
    const { step, historyAction } = this.assertAllowed(actor, action);

    if (action === 'check' || action === 'approve') {
      await this.assertSegregationOfDuties(actor, id, wo.createdById, action);
    }
    if (action === 'check') await this.assertHasPlannedCosts(id);
    if (action === 'revert') await this.assertNoActiveAdvances(id);

    await this.prisma.$transaction(async (tx) => {
      // Perpindahan bersyarat pada status lama: dua permintaan bersamaan
      // tidak bisa sama-sama berhasil.
      const moved = await tx.workOrder.updateMany({
        where: { id, status: wo.status },
        data: { status: rule.to },
      });
      if (moved.count !== 1) {
        throw new ConflictException('Status Work Order baru saja berubah. Muat ulang lalu coba lagi');
      }
      await this.approvals.record(tx, {
        docType: 'WORK_ORDER_COST',
        docId: id,
        step,
        action: historyAction,
        actorId: actor.id,
        note,
      });
    });

    return this.workOrders.findOne(id);
  }

  // Izin per aksi. check/approve/revert sudah dijaga @Permissions di controller;
  // reject boleh oleh pemegang check ATAU approve, jadi dicek di sini.
  private assertAllowed(actor: AuthUser, action: CostAction): {
    step: ApprovalStep;
    historyAction: ApprovalAction;
  } {
    const can = (code: string) => actor.permissions.includes(code);
    const canCheck = can(PERMISSIONS.WORK_ORDER_COST_CHECK.code);
    const canApprove = can(PERMISSIONS.WORK_ORDER_COST_APPROVE.code);

    switch (action) {
      case 'check':
        if (!canCheck) throw this.forbidden();
        return { step: 'CHECK', historyAction: 'DONE' };
      case 'approve':
        if (!canApprove) throw this.forbidden();
        return { step: 'APPROVE', historyAction: 'DONE' };
      case 'reject':
        if (!canCheck && !canApprove) throw this.forbidden();
        return { step: canApprove ? 'APPROVE' : 'CHECK', historyAction: 'REJECT' };
      case 'revert':
        if (!canApprove) throw this.forbidden();
        return { step: 'APPROVE', historyAction: 'REVERT' };
    }
  }

  private forbidden() {
    return new ForbiddenException('Anda tidak memiliki akses untuk tindakan ini');
  }

  // Pemisahan tugas:
  //  - pemeriksa dan penyetuju tidak boleh orang yang membuat WO / menyusun rencana biayanya;
  //  - penyetuju tidak boleh orang yang memeriksa.
  private async assertSegregationOfDuties(
    actor: AuthUser,
    workOrderId: string,
    creatorId: string | null,
    action: 'check' | 'approve',
  ) {
    const role = action === 'check' ? 'Pemeriksa' : 'Penyetuju';

    const authoredCosts = await this.prisma.plannedCost.count({
      where: { workOrderItem: { workOrderId }, createdById: actor.id },
    });
    if (creatorId === actor.id || authoredCosts > 0) {
      throw new ForbiddenException(
        `${role} tidak boleh orang yang membuat Work Order atau menyusun rencana biayanya (pemisahan tugas)`,
      );
    }

    if (action === 'approve') {
      const lastCheck = await this.prisma.approvalHistory.findFirst({
        where: { docType: 'WORK_ORDER_COST', docId: workOrderId, step: 'CHECK', action: 'DONE' },
        orderBy: [{ actedAt: 'desc' }, { id: 'desc' }],
        select: { actorId: true },
      });
      if (lastCheck?.actorId === actor.id) {
        throw new ForbiddenException(
          'Penyetuju tidak boleh orang yang sama dengan pemeriksa (pemisahan tugas)',
        );
      }
    }
  }

  private async assertHasPlannedCosts(workOrderId: string) {
    const count = await this.prisma.plannedCost.count({
      where: { workOrderItem: { workOrderId, status: 'ACTIVE' } },
    });
    if (count === 0) {
      throw new ConflictException('Belum ada rencana biaya pada item aktif. Isi rencana biaya terlebih dahulu');
    }
  }

  // Biaya yang sudah dipakai sebagai dasar pengajuan dana tidak boleh ditarik.
  private async assertNoActiveAdvances(workOrderId: string) {
    const active = await this.prisma.cashAdvance.count({
      where: { workOrderId, status: { notIn: ['REJECTED', 'CANCELLED'] } },
    });
    if (active > 0) {
      throw new ConflictException(
        `Masih ada ${active} pengajuan dana aktif. Batalkan atau selesaikan terlebih dahulu`,
      );
    }
  }

  private async loadWorkOrder(id: string) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id },
      select: { id: true, status: true, createdById: true },
    });
    if (!wo) throw new NotFoundException('Work Order tidak ditemukan');
    return wo;
  }
}
