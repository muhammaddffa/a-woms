import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalService } from '../approval/approval.service.js';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { sumDecimals } from '../common/utils/decimal.util.js';
import { lockNumberSeries, nextNumber } from '../common/utils/number-generator.util.js';
import { Prisma } from '../generated/prisma/client.js';
import type { CashAdvanceType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WorkflowSettingService } from '../workflow-setting/workflow-setting.service.js';
import {
  DEAD_STATUSES,
  loadSettlement,
  missingDocuments,
  runStep,
  yymm,
  type Db,
  type StepDeps,
} from './cash-advance.helpers.js';
import type {
  CreateCashAdvanceDto,
  ListCashAdvancesQuery,
  UpdateCashAdvanceDto,
} from './dto/cash-advance.dto.js';

interface ItemInput {
  plannedCostId: string;
  advanceAmount: number;
  note?: string;
}

const UANG_JALAN = 'UANG_JALAN';

@Injectable()
export class CashAdvanceService {
  private readonly deps: StepDeps;

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalService,
    private readonly workflow: WorkflowSettingService,
  ) {
    this.deps = { prisma, approvals };
  }

  // ---------------------------------------------------------------
  // Baca
  // ---------------------------------------------------------------
  async list(query: ListCashAdvancesQuery) {
    const where: Prisma.CashAdvanceWhereInput = {
      ...(query.workOrderId && { workOrderId: query.workOrderId }),
      ...(query.status && { status: query.status }),
      ...(query.advanceType && { advanceType: query.advanceType }),
      ...(query.holderId && { holderId: query.holderId }),
      ...(query.search && { number: { contains: query.search, mode: 'insensitive' as const } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.cashAdvance.findMany({
        where,
        select: {
          id: true,
          number: true,
          advanceType: true,
          advanceDate: true,
          recipient: true,
          status: true,
          createdAt: true,
          workOrder: { select: { id: true, number: true } },
          holder: { select: { id: true, fullName: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.cashAdvance.count({ where }),
    ]);
    const sums = await this.prisma.cashAdvanceItem.groupBy({
      by: ['cashAdvanceId'],
      where: { cashAdvanceId: { in: rows.map((r) => r.id) } },
      _sum: { advanceAmount: true },
    });
    const totalById = new Map(sums.map((s) => [s.cashAdvanceId, s._sum.advanceAmount]));
    return {
      data: rows.map((r) => ({ ...r, totalAmount: totalById.get(r.id) ?? new Prisma.Decimal(0) })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findOne(id: string) {
    const ca = await this.prisma.cashAdvance.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        advanceType: true,
        advanceDate: true,
        recipient: true,
        description: true,
        status: true,
        requiredSteps: true,
        transferFee: true,
        createdAt: true,
        updatedAt: true,
        workOrder: {
          select: { id: true, number: true, status: true, customer: { select: { code: true, name: true } } },
        },
        holder: { select: { id: true, fullName: true } },
        createdBy: { select: { id: true, fullName: true } },
        cashAccount: { select: { id: true, code: true, name: true } },
        items: {
          select: {
            id: true,
            advanceAmount: true,
            actualAmount: true,
            note: true,
            plannedCost: {
              select: {
                id: true,
                totalCost: true,
                bearer: true,
                chargeType: { select: { id: true, code: true, name: true, billingMode: true } },
                workOrderItem: { select: { id: true, lineNo: true, containerNo: true } },
              },
            },
          },
          orderBy: [
            { plannedCost: { workOrderItem: { lineNo: 'asc' } } },
            { plannedCost: { chargeType: { sortOrder: 'asc' } } },
          ],
        },
        extraCosts: {
          select: {
            id: true,
            workOrderItemId: true,
            chargeTypeId: true,
            description: true,
            amount: true,
            billable: true,
            note: true,
            chargeType: { select: { code: true, name: true } },
          },
          orderBy: { id: 'asc' },
        },
        returnItems: {
          select: {
            amount: true,
            advanceReturn: { select: { id: true, number: true, status: true, direction: true, returnDate: true } },
          },
        },
      },
    });
    if (!ca) throw new NotFoundException('Pengajuan dana tidak ditemukan');

    const attachments = await this.prisma.attachment.findMany({
      where: {
        OR: [
          { ownerType: 'CASH_ADVANCE', ownerId: id },
          { ownerType: 'CASH_ADVANCE_ITEM', ownerId: { in: ca.items.map((i) => i.id) } },
          { ownerType: 'CASH_ADVANCE_EXTRA_COST', ownerId: { in: ca.extraCosts.map((e) => e.id) } },
        ],
      },
      select: { id: true, ownerType: true, ownerId: true, kind: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true },
      orderBy: [{ uploadedAt: 'asc' }, { id: 'asc' }],
    });

    const settlement = await loadSettlement(this.prisma, id);
    return {
      ...ca,
      attachments,
      settlement,
      // Kartu kesiapan: dokumen yang masih kurang sebelum LPJ dapat diajukan.
      missingDocuments: missingDocuments(ca, attachments),
    };
  }

  // ---------------------------------------------------------------
  // Buat / ubah (hanya DRAFT)
  // ---------------------------------------------------------------
  async create(actor: AuthUser, dto: CreateCashAdvanceDto) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id: dto.workOrderId },
      select: { status: true },
    });
    if (!wo) throw new NotFoundException('Work Order tidak ditemukan');
    if (wo.status !== 'COST_APPROVED') {
      throw new ConflictException('Pengajuan dana hanya dapat dibuat setelah biaya Work Order disetujui');
    }
    const holderId = dto.holderId ?? actor.id;
    await this.assertHolder(holderId);

    const prefix = `${dto.advanceType === 'OPERATIONAL' ? 'CB' : 'UJ'}/${yymm(dto.advanceDate)}/`;
    const id = await this.prisma.$transaction(async (tx) => {
      await this.validateItems(tx, {
        workOrderId: dto.workOrderId,
        advanceType: dto.advanceType,
        items: dto.items,
      });
      await lockNumberSeries(tx, prefix);
      const last = await tx.cashAdvance.findFirst({
        where: { number: { startsWith: prefix } },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      const total = sumDecimals(dto.items.map((i) => i.advanceAmount));
      const created = await tx.cashAdvance.create({
        data: {
          number: nextNumber(prefix, last?.number ?? null),
          advanceType: dto.advanceType,
          workOrderId: dto.workOrderId,
          advanceDate: dto.advanceDate,
          recipient: dto.recipient,
          holderId,
          description: dto.description,
          requiredSteps: await this.workflow.resolveRequiredSteps(tx, 'CASH_ADVANCE', total),
          createdById: actor.id,
          items: {
            create: dto.items.map((i) => ({
              plannedCostId: i.plannedCostId,
              advanceAmount: i.advanceAmount,
              note: i.note,
            })),
          },
        },
        select: { id: true },
      });
      return created.id;
    });
    return this.findOne(id);
  }

  async update(actor: AuthUser, id: string, dto: UpdateCashAdvanceDto) {
    const ca = await this.loadDraft(actor, id);
    if (dto.holderId) await this.assertHolder(dto.holderId);

    await this.prisma.$transaction(async (tx) => {
      let requiredSteps: Prisma.CashAdvanceUpdateInput['requiredSteps'];
      if (dto.items) {
        await this.validateItems(tx, {
          workOrderId: ca.workOrderId,
          advanceType: ca.advanceType,
          items: dto.items,
          excludeAdvanceId: id,
        });
        await tx.cashAdvanceItem.deleteMany({ where: { cashAdvanceId: id } });
        await tx.cashAdvanceItem.createMany({
          data: dto.items.map((i) => ({
            cashAdvanceId: id,
            plannedCostId: i.plannedCostId,
            advanceAmount: i.advanceAmount,
            note: i.note,
          })),
        });
        const total = sumDecimals(dto.items.map((i) => i.advanceAmount));
        requiredSteps = await this.workflow.resolveRequiredSteps(tx, 'CASH_ADVANCE', total);
      }
      const moved = await tx.cashAdvance.updateMany({
        where: { id, status: 'DRAFT' },
        data: {
          recipient: dto.recipient,
          holderId: dto.holderId,
          description: dto.description,
          ...(requiredSteps ? { requiredSteps } : {}),
        },
      });
      if (moved.count !== 1) {
        throw new ConflictException('Status dokumen baru saja berubah. Muat ulang lalu coba lagi');
      }
    });
    return this.findOne(id);
  }

  // Dibatalkan oleh pembuatnya selama dana belum dicairkan.
  async cancel(actor: AuthUser, id: string, reason: string) {
    await this.loadCreatorDoc(actor, id);
    await runStep(this.deps, actor, id, {
      allowedFrom: ['DRAFT', 'CHECKED', 'APPROVED'],
      to: 'CANCELLED',
      // Dicatat sebagai pembatalan (REVERT) pada langkah persetujuan.
      step: 'APPROVE',
      action: 'REVERT',
      note: reason,
      forbid: [],
      label: 'Pembatal',
    });
    return this.findOne(id);
  }

  // ---------------------------------------------------------------
  // Langkah alur: cek -> setujui -> bayar -> verifikasi transfer
  // ---------------------------------------------------------------
  async check(actor: AuthUser, id: string, note?: string) {
    await runStep(this.deps, actor, id, {
      allowedFrom: ['DRAFT'],
      to: 'CHECKED',
      step: 'CHECK',
      note,
      forbid: ['creator', 'holder'],
      label: 'Pemeriksa',
      // Pengaturan bisa berubah selama DRAFT: hitung ulang, lalu bekukan.
      prepare: async (tx, ca) => {
        const required = await this.requiredNow(tx, ca.id);
        if (!required.includes('CHECK')) {
          throw new ConflictException('Langkah pengecekan tidak berlaku untuk pengajuan ini. Lanjutkan ke persetujuan');
        }
        return { requiredSteps: required };
      },
    });
    return this.findOne(id);
  }

  async approve(actor: AuthUser, id: string, note?: string) {
    await runStep(this.deps, actor, id, {
      allowedFrom: ['DRAFT', 'CHECKED'],
      to: 'APPROVED',
      step: 'APPROVE',
      note,
      forbid: ['creator', 'holder', 'checker'],
      label: 'Penyetuju',
      prepare: async (tx, ca) => {
        if (ca.status !== 'DRAFT') return;
        const required = await this.requiredNow(tx, ca.id);
        if (required.includes('CHECK')) {
          throw new ConflictException('Pengajuan harus dicek terlebih dahulu');
        }
        return { requiredSteps: required };
      },
    });
    return this.findOne(id);
  }

  // Menolak = akhir dokumen (REJECTED). Izin diperiksa di sini karena pemeriksa maupun penyetuju boleh menolak.
  async reject(actor: AuthUser, id: string, reason: string) {
    const can = (code: string) => actor.permissions.includes(code);
    const canCheck = can(PERMISSIONS.CASH_ADVANCE_CHECK.code);
    const canApprove = can(PERMISSIONS.CASH_ADVANCE_APPROVE.code);
    if (!canCheck && !canApprove) throw new ForbiddenException('Anda tidak memiliki akses untuk tindakan ini');
    const current = await this.prisma.cashAdvance.findUnique({ where: { id }, select: { status: true } });
    if (current?.status === 'CHECKED' && !canApprove) {
      throw new ForbiddenException('Anda tidak memiliki akses untuk tindakan ini');
    }
    await runStep(this.deps, actor, id, {
      allowedFrom: ['DRAFT', 'CHECKED'],
      to: 'REJECTED',
      step: canApprove ? 'APPROVE' : 'CHECK',
      action: 'REJECT',
      note: reason,
      forbid: ['creator', 'holder'],
      label: 'Penolak',
    });
    return this.findOne(id);
  }

  // Keuangan mencairkan dana. Bukti transfer wajib sudah diunggah.
  async pay(actor: AuthUser, id: string, dto: { cashAccountId: string; transferFee?: number; note?: string }) {
    const account = await this.prisma.cashAccount.findUnique({ where: { id: dto.cashAccountId }, select: { id: true } });
    if (!account) throw new BadRequestException('Rekening kas/bank tidak ditemukan');
    await runStep(this.deps, actor, id, {
      allowedFrom: ['APPROVED'],
      to: 'PAID',
      step: 'PAY',
      note: dto.note,
      forbid: ['creator', 'holder', 'checker', 'approver'],
      label: 'Pembayar',
      prepare: async (tx, ca) => {
        await this.assertTransferProof(tx, ca.id);
        return { cashAccountId: dto.cashAccountId, transferFee: dto.transferFee ?? 0 };
      },
    });
    return this.findOne(id);
  }

  // Checker memastikan transfer benar-benar terjadi. Setelah ini staf operasional boleh membuat LPJ.
  async verifyTransfer(actor: AuthUser, id: string, note?: string) {
    await runStep(this.deps, actor, id, {
      allowedFrom: ['PAID'],
      to: 'TRANSFER_VERIFIED',
      step: 'VERIFY_TRANSFER',
      note,
      forbid: ['creator', 'holder', 'payer'],
      label: 'Pemverifikasi transfer',
      prepare: async (tx, ca) => {
        if (!ca.requiredSteps.includes('VERIFY_TRANSFER')) {
          throw new ConflictException('Verifikasi transfer tidak berlaku untuk pengajuan ini. LPJ dapat langsung dibuat');
        }
        await this.assertTransferProof(tx, ca.id);
      },
    });
    return this.findOne(id);
  }

  history(actor: AuthUser, id: string) {
    return this.approvals.list(actor, 'CASH_ADVANCE', id);
  }

  // ---------------------------------------------------------------
  // Aturan
  // ---------------------------------------------------------------
  private async requiredNow(tx: Db, id: string) {
    const agg = await tx.cashAdvanceItem.aggregate({ where: { cashAdvanceId: id }, _sum: { advanceAmount: true } });
    return this.workflow.resolveRequiredSteps(tx, 'CASH_ADVANCE', agg._sum.advanceAmount ?? 0);
  }

  private async assertTransferProof(tx: Db, id: string) {
    const count = await tx.attachment.count({
      where: { ownerType: 'CASH_ADVANCE', ownerId: id, kind: 'TRANSFER_PROOF' },
    });
    if (count === 0) throw new ConflictException('Bukti transfer belum diunggah');
  }

  private async assertHolder(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
    if (!user?.isActive) throw new BadRequestException('Pemegang dana tidak ditemukan atau tidak aktif');
  }

  private async loadCreatorDoc(actor: AuthUser, id: string) {
    const ca = await this.prisma.cashAdvance.findUnique({
      where: { id },
      select: { id: true, status: true, advanceType: true, workOrderId: true, createdById: true },
    });
    if (!ca) throw new NotFoundException('Pengajuan dana tidak ditemukan');
    if (ca.createdById !== actor.id) {
      throw new ForbiddenException('Hanya pembuat pengajuan yang dapat mengubah atau membatalkannya');
    }
    return ca;
  }

  private async loadDraft(actor: AuthUser, id: string) {
    const ca = await this.loadCreatorDoc(actor, id);
    if (ca.status !== 'DRAFT') throw new ConflictException('Pengajuan hanya dapat diubah saat berstatus DRAFT');
    return ca;
  }

  // Validasi baris pengajuan: milik WO ini, bukan tarif sembunyi, ditanggung perusahaan,
  // jenisnya sesuai tipe pengajuan, dan total pengajuan aktif tidak melebihi biaya rencana.
  private async validateItems(
    tx: Db,
    p: { workOrderId: string; advanceType: CashAdvanceType; items: ItemInput[]; excludeAdvanceId?: string },
  ) {
    const ids = p.items.map((i) => i.plannedCostId).sort();
    // Kunci baris biaya rencana agar dua pengajuan bersamaan tidak sama-sama lolos batas.
    await tx.$queryRaw`SELECT id FROM planned_costs WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;

    const costs = await tx.plannedCost.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        totalCost: true,
        bearer: true,
        workOrderItemId: true,
        workOrderItem: { select: { workOrderId: true, status: true, lineNo: true } },
        chargeType: { select: { code: true, category: true, isHidden: true, isActive: true } },
      },
    });
    if (costs.length !== ids.length) throw new BadRequestException('Ada rencana biaya yang tidak ditemukan');

    for (const c of costs) {
      const label = `${c.chargeType.code} (item ${c.workOrderItem.lineNo})`;
      if (c.workOrderItem.workOrderId !== p.workOrderId) {
        throw new BadRequestException(`Rencana biaya ${label} bukan milik Work Order ini`);
      }
      if (c.workOrderItem.status !== 'ACTIVE') throw new ConflictException(`Item untuk ${label} tidak aktif`);
      if (c.chargeType.isHidden || !c.chargeType.isActive) {
        throw new BadRequestException(`Jenis biaya ${c.chargeType.code} tidak dapat diajukan`);
      }
      if (c.bearer === 'VENDOR') {
        throw new ConflictException(`Biaya ${label} ditanggung vendor, tidak dapat diajukan dananya`);
      }
      const isUangJalan = c.chargeType.category === UANG_JALAN;
      if (p.advanceType === 'DRIVER_ALLOWANCE' && !isUangJalan) {
        throw new BadRequestException(`Biaya ${label} bukan komponen uang jalan`);
      }
      if (p.advanceType === 'OPERATIONAL' && isUangJalan) {
        throw new BadRequestException(`Biaya ${label} adalah komponen uang jalan, ajukan sebagai uang jalan`);
      }
    }

    // Batas kumulatif: seluruh pengajuan aktif untuk satu biaya rencana <= total biaya rencana.
    const existing = await tx.cashAdvanceItem.groupBy({
      by: ['plannedCostId'],
      where: {
        plannedCostId: { in: ids },
        cashAdvance: {
          status: { notIn: DEAD_STATUSES },
          ...(p.excludeAdvanceId ? { id: { not: p.excludeAdvanceId } } : {}),
        },
      },
      _sum: { advanceAmount: true },
    });
    const used = new Map(existing.map((e) => [e.plannedCostId, e._sum.advanceAmount ?? new Prisma.Decimal(0)]));
    for (const input of p.items) {
      const cost = costs.find((c) => c.id === input.plannedCostId)!;
      const remaining = cost.totalCost.sub(used.get(cost.id) ?? 0);
      if (new Prisma.Decimal(input.advanceAmount).gt(remaining)) {
        throw new ConflictException(
          `Pengajuan untuk ${cost.chargeType.code} (item ${cost.workOrderItem.lineNo}) melebihi biaya rencana. ` +
            `Sisa yang dapat diajukan: ${remaining.toFixed(2)}`,
        );
      }
    }

    // Satu item WO hanya boleh punya satu uang jalan aktif (aturan sistem lama).
    if (p.advanceType === 'DRIVER_ALLOWANCE') {
      const itemIds = [...new Set(costs.map((c) => c.workOrderItemId))];
      const dup = await tx.cashAdvance.findFirst({
        where: {
          advanceType: 'DRIVER_ALLOWANCE',
          status: { notIn: DEAD_STATUSES },
          ...(p.excludeAdvanceId ? { id: { not: p.excludeAdvanceId } } : {}),
          items: { some: { plannedCost: { workOrderItemId: { in: itemIds } } } },
        },
        select: { number: true },
      });
      if (dup) throw new ConflictException(`Item sudah memiliki uang jalan aktif (${dup.number})`);
    }
  }
}
