import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalService } from '../approval/approval.service.js';
import { AttachmentService } from '../attachment/attachment.service.js';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CashAdvanceService } from './cash-advance.service.js';
import {
  loadCore,
  loadSettlement,
  moveStatus,
  reportStartStatus,
  runStep,
  type AdvanceCore,
  type Db,
  type StepDeps,
} from './cash-advance.helpers.js';
import type { ActualsDto, CreateExtraCostDto, UpdateExtraCostDto } from './dto/cash-advance.dto.js';

// LPJ (laporan pertanggungjawaban): realisasi biaya, bukti, pemeriksaan, persetujuan,
// dan pembentukan tagihan ke customer dari biaya yang disetujui.
@Injectable()
export class CashAdvanceReportService {
  private readonly deps: StepDeps;

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalService,
    private readonly advances: CashAdvanceService,
    private readonly attachments: AttachmentService,
  ) {
    this.deps = { prisma, approvals };
  }

  // ---------------------------------------------------------------
  // Isi LPJ (hanya pemegang dana, hanya saat LPJ terbuka)
  // ---------------------------------------------------------------
  async saveActuals(actor: AuthUser, id: string, dto: ActualsDto) {
    await this.loadOpenReport(actor, id);
    await this.prisma.$transaction(async (tx) => {
      for (const row of dto.items) {
        const updated = await tx.cashAdvanceItem.updateMany({
          where: { id: row.itemId, cashAdvanceId: id },
          data: { actualAmount: row.actualAmount, note: row.note },
        });
        if (updated.count !== 1) throw new BadRequestException('Ada baris yang bukan bagian dari pengajuan ini');
      }
    });
    return this.advances.findOne(id);
  }

  async addExtraCost(actor: AuthUser, id: string, dto: CreateExtraCostDto) {
    const ca = await this.loadOpenReport(actor, id);
    await this.assertExtraRefs(ca, dto.workOrderItemId, dto.chargeTypeId);
    await this.prisma.cashAdvanceExtraCost.create({
      data: {
        cashAdvanceId: id,
        workOrderItemId: dto.workOrderItemId,
        chargeTypeId: dto.chargeTypeId,
        description: dto.description,
        amount: dto.amount,
        billable: dto.billable,
        note: dto.note,
      },
    });
    return this.advances.findOne(id);
  }

  async updateExtraCost(actor: AuthUser, id: string, extraId: string, dto: UpdateExtraCostDto) {
    const ca = await this.loadOpenReport(actor, id);
    const current = await this.loadExtra(id, extraId);
    if (dto.chargeTypeId) await this.assertExtraRefs(ca, current.workOrderItemId, dto.chargeTypeId);
    await this.prisma.cashAdvanceExtraCost.update({
      where: { id: extraId },
      data: {
        chargeTypeId: dto.chargeTypeId,
        description: dto.description,
        amount: dto.amount,
        billable: dto.billable,
        note: dto.note,
      },
    });
    return this.advances.findOne(id);
  }

  async removeExtraCost(actor: AuthUser, id: string, extraId: string) {
    await this.loadOpenReport(actor, id);
    await this.loadExtra(id, extraId);
    await this.prisma.cashAdvanceExtraCost.delete({ where: { id: extraId } });
    await this.attachments.removeForOwner('CASH_ADVANCE_EXTRA_COST', extraId);
    return this.advances.findOne(id);
  }

  // ---------------------------------------------------------------
  // Alur LPJ: ajukan -> periksa -> setujui (atau kembalikan)
  // ---------------------------------------------------------------
  async submit(actor: AuthUser, id: string) {
    const ca = await this.loadOpenReport(actor, id);
    // LPJ hanya dapat diajukan bila seluruh dokumen sudah terkumpul.
    const detail = await this.advances.findOne(id);
    if (detail.missingDocuments.length > 0) {
      throw new ConflictException({
        message: 'Dokumen LPJ belum lengkap',
        missing: detail.missingDocuments,
      });
    }
    await runStep(this.deps, actor, id, {
      allowedFrom: [reportStartStatus(ca.requiredSteps)],
      to: 'REPORT_SUBMITTED',
      step: 'REPORT_SUBMIT',
      forbid: [],
      label: 'Pengaju LPJ',
    });
    return this.advances.findOne(id);
  }

  async check(actor: AuthUser, id: string, note?: string) {
    await runStep(this.deps, actor, id, {
      allowedFrom: ['REPORT_SUBMITTED'],
      to: 'REPORT_CHECKED',
      step: 'REPORT_CHECK',
      note,
      forbid: ['creator', 'holder'],
      label: 'Pemeriksa LPJ',
      prepare: async (_tx, ca) => {
        if (!ca.requiredSteps.includes('REPORT_CHECK')) {
          throw new ConflictException('Pemeriksaan LPJ tidak berlaku untuk pengajuan ini. Lanjutkan ke persetujuan');
        }
      },
    });
    return this.advances.findOne(id);
  }

  // Mengembalikan LPJ ke pemegang dana untuk diperbaiki (bon kurang, angka tidak cocok).
  async returnReport(actor: AuthUser, id: string, reason: string) {
    const can = (code: string) => actor.permissions.includes(code);
    const canCheck = can(PERMISSIONS.CASH_ADVANCE_CHECK_REPORT.code);
    const canApprove = can(PERMISSIONS.CASH_ADVANCE_APPROVE_REPORT.code);
    const current = await loadCore(this.prisma, id);
    const allowed = current.status === 'REPORT_CHECKED' ? canApprove : canCheck || canApprove;
    if (!allowed) throw new ForbiddenException('Anda tidak memiliki akses untuk tindakan ini');

    await runStep(this.deps, actor, id, {
      allowedFrom: ['REPORT_SUBMITTED', 'REPORT_CHECKED'],
      to: (ca) => reportStartStatus(ca.requiredSteps),
      step: current.status === 'REPORT_CHECKED' || canApprove ? 'REPORT_APPROVE' : 'REPORT_CHECK',
      action: 'REJECT',
      note: reason,
      forbid: ['creator', 'holder'],
      label: 'Pengembali LPJ',
    });
    return this.advances.findOne(id);
  }

  // Persetujuan LPJ: status berpindah, tagihan AT_COST dibentuk, dan bila tidak ada
  // selisih dana, dokumen langsung SETTLED. Semuanya dalam satu transaksi.
  async approve(actor: AuthUser, id: string, note?: string) {
    await runStep(this.deps, actor, id, {
      allowedFrom: ['REPORT_SUBMITTED', 'REPORT_CHECKED'],
      to: 'REPORT_APPROVED',
      step: 'REPORT_APPROVE',
      note,
      forbid: ['creator', 'holder', 'reportChecker'],
      label: 'Penyetuju LPJ',
      prepare: async (_tx, ca) => {
        if (ca.status === 'REPORT_SUBMITTED' && ca.requiredSteps.includes('REPORT_CHECK')) {
          throw new ConflictException('LPJ harus diperiksa terlebih dahulu');
        }
      },
      afterMove: async (tx, ca) => {
        await this.syncBillableCharges(tx, ca.workOrderId);
        const s = await loadSettlement(tx, ca.id);
        if (s.due.isZero()) await moveStatus(tx, ca.id, ['REPORT_APPROVED'], 'SETTLED');
      },
    });
    return this.advances.findOne(id);
  }

  // ---------------------------------------------------------------
  // Penagihan: jenis biaya AT_COST ditagih sebesar realisasi yang sudah disetujui.
  // Dihitung ulang dari SEMUA LPJ yang disetujui pada WO, sehingga hasilnya sama
  // berapa kali pun dijalankan. Tarif FIXED (mis. trucking per ritase) tidak disentuh.
  // Hanya biaya yang ditanggung perusahaan (bearer COMPANY) yang ditagihkan.
  // ---------------------------------------------------------------
  private async syncBillableCharges(tx: Db, workOrderId: string) {
    const approved = { in: ['REPORT_APPROVED', 'SETTLED'] as ('REPORT_APPROVED' | 'SETTLED')[] };
    const items = await tx.cashAdvanceItem.findMany({
      where: {
        cashAdvance: { workOrderId, status: approved },
        plannedCost: { bearer: 'COMPANY', chargeType: { billingMode: 'AT_COST' } },
      },
      select: {
        actualAmount: true,
        plannedCost: { select: { workOrderItemId: true, chargeTypeId: true } },
      },
    });
    const extras = await tx.cashAdvanceExtraCost.findMany({
      where: { cashAdvance: { workOrderId, status: approved }, billable: true, chargeType: { billingMode: 'AT_COST' } },
      select: { amount: true, workOrderItemId: true, chargeTypeId: true },
    });

    const totals = new Map<string, { itemId: string; typeId: string; total: Prisma.Decimal }>();
    const add = (itemId: string, typeId: string, amount: Prisma.Decimal | null) => {
      const key = `${itemId}|${typeId}`;
      const row = totals.get(key) ?? { itemId, typeId, total: new Prisma.Decimal(0) };
      row.total = row.total.add(amount ?? 0);
      totals.set(key, row);
    };
    for (const i of items) add(i.plannedCost.workOrderItemId, i.plannedCost.chargeTypeId, i.actualAmount);
    for (const e of extras) add(e.workOrderItemId, e.chargeTypeId, e.amount);

    for (const { itemId, typeId, total } of totals.values()) {
      const key = { workOrderItemId_chargeTypeId: { workOrderItemId: itemId, chargeTypeId: typeId } };
      const existing = await tx.billableCharge.findUnique({ where: key });
      if (existing?.invoiceId && !existing.totalPrice.eq(total)) {
        throw new ConflictException(
          'Tagihan untuk biaya ini sudah masuk invoice dan nilainya berbeda dari realisasi LPJ. Hubungi bagian invoice',
        );
      }
      if (existing?.invoiceId) continue;
      if (!existing && total.isZero()) continue;
      await tx.billableCharge.upsert({
        where: key,
        update: { quantity: 1, unitPrice: total, totalPrice: total, note: 'Sesuai realisasi LPJ' },
        create: {
          workOrderItemId: itemId,
          chargeTypeId: typeId,
          quantity: 1,
          unitPrice: total,
          totalPrice: total,
          note: 'Sesuai realisasi LPJ',
        },
      });
    }
  }

  // ---------------------------------------------------------------
  // Aturan
  // ---------------------------------------------------------------
  // LPJ hanya dapat diisi pemegang dana, dan hanya saat LPJ terbuka (dana sudah ada di tangannya).
  private async loadOpenReport(actor: AuthUser, id: string): Promise<AdvanceCore> {
    const ca = await loadCore(this.prisma, id);
    if (ca.holderId !== actor.id) {
      throw new ForbiddenException('Hanya pemegang dana yang dapat mengisi dan mengajukan LPJ');
    }
    const open = reportStartStatus(ca.requiredSteps);
    if (ca.status !== open) {
      throw new ConflictException(
        `LPJ hanya dapat diisi saat status ${open}. Status saat ini: ${ca.status}`,
      );
    }
    return ca;
  }

  private async loadExtra(cashAdvanceId: string, extraId: string) {
    const extra = await this.prisma.cashAdvanceExtraCost.findFirst({
      where: { id: extraId, cashAdvanceId },
      select: { id: true, workOrderItemId: true },
    });
    if (!extra) throw new NotFoundException('Biaya di luar rencana tidak ditemukan pada pengajuan ini');
    return extra;
  }

  private async assertExtraRefs(ca: AdvanceCore, workOrderItemId: string, chargeTypeId: string) {
    const item = await this.prisma.workOrderItem.findFirst({
      where: { id: workOrderItemId, workOrderId: ca.workOrderId },
      select: { id: true },
    });
    if (!item) throw new BadRequestException('Item bukan bagian dari Work Order pengajuan ini');
    const type = await this.prisma.chargeType.findUnique({
      where: { id: chargeTypeId },
      select: { isActive: true, isHidden: true },
    });
    if (!type || !type.isActive || type.isHidden) {
      throw new BadRequestException('Jenis biaya tidak ditemukan atau tidak aktif');
    }
  }
}
