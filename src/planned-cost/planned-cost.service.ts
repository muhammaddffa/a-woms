import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { isUniqueViolation } from '../common/constants/role.constant.js';
import { lineTotal, sumDecimals } from '../common/utils/decimal.util.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreatePlannedCostDto, UpdatePlannedCostDto } from './dto/planned-cost.dto.js';

const plannedCostSelect = {
  id: true,
  workOrderItemId: true,
  chargeTypeId: true,
  quantity: true,
  unitCost: true,
  totalCost: true,
  note: true,
  updatedAt: true,
  workOrderItem: { select: { lineNo: true, containerNo: true } },
  chargeType: {
    select: { id: true, code: true, name: true, category: true, useActualCost: true, isHidden: true },
  },
} satisfies Prisma.PlannedCostSelect;

const canSeeHidden = (actor: AuthUser) =>
  actor.permissions.includes(PERMISSIONS.CHARGE_VIEW_HIDDEN.code);

@Injectable()
export class PlannedCostService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthUser, workOrderId: string) {
    await this.loadWorkOrderStatus(workOrderId);
    const rows = await this.prisma.plannedCost.findMany({
      where: {
        workOrderItem: { workOrderId },
        ...(canSeeHidden(actor) ? {} : { chargeType: { isHidden: false } }),
      },
      select: plannedCostSelect,
      orderBy: [{ workOrderItem: { lineNo: 'asc' } }, { chargeType: { sortOrder: 'asc' } }],
    });
    return { data: rows, total: sumDecimals(rows.map((r) => r.totalCost)) };
  }

  async create(actor: AuthUser, workOrderId: string, itemId: string, dto: CreatePlannedCostDto) {
    await this.assertCostsEditable(workOrderId);

    const item = await this.prisma.workOrderItem.findFirst({
      where: { id: itemId, workOrderId },
      select: { status: true },
    });
    if (!item) throw new NotFoundException('Item tidak ditemukan pada Work Order ini');
    if (item.status !== 'ACTIVE') throw new ConflictException('Item tidak aktif');

    await this.assertChargeTypeUsable(actor, dto.chargeTypeId);

    const duplicate = await this.prisma.plannedCost.findUnique({
      where: { workOrderItemId_chargeTypeId: { workOrderItemId: itemId, chargeTypeId: dto.chargeTypeId } },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('Jenis biaya ini sudah ada pada item. Ubah barisnya');

    try {
      return await this.prisma.plannedCost.create({
        data: {
          workOrderItemId: itemId,
          chargeTypeId: dto.chargeTypeId,
          quantity: dto.quantity,
          unitCost: dto.unitCost,
          totalCost: lineTotal(dto.quantity, dto.unitCost),
          note: dto.note,
          createdById: actor.id,
        },
        select: plannedCostSelect,
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Jenis biaya ini sudah ada pada item');
      throw e;
    }
  }

  async update(actor: AuthUser, workOrderId: string, id: string, dto: UpdatePlannedCostDto) {
    await this.assertCostsEditable(workOrderId);
    const current = await this.loadPlannedCost(actor, workOrderId, id);

    const quantity = dto.quantity ?? current.quantity;
    const unitCost = dto.unitCost ?? current.unitCost;
    return this.prisma.plannedCost.update({
      where: { id },
      data: {
        quantity: dto.quantity,
        unitCost: dto.unitCost,
        note: dto.note,
        totalCost: lineTotal(quantity, unitCost),
      },
      select: plannedCostSelect,
    });
  }

  async remove(actor: AuthUser, workOrderId: string, id: string) {
    await this.assertCostsEditable(workOrderId);
    await this.loadPlannedCost(actor, workOrderId, id);

    const used = await this.prisma.cashAdvanceItem.count({ where: { plannedCostId: id } });
    if (used > 0) throw new ConflictException('Sudah dipakai pengajuan dana, tidak dapat dihapus');

    await this.prisma.plannedCost.delete({ where: { id } });
    return { message: 'Rencana biaya berhasil dihapus' };
  }

  // ---------------- aturan ----------------

  private async loadWorkOrderStatus(workOrderId: string) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { status: true },
    });
    if (!wo) throw new NotFoundException('Work Order tidak ditemukan');
    return wo.status;
  }

  // Rencana biaya hanya bisa diubah saat status WO = OPEN.
  private async assertCostsEditable(workOrderId: string) {
    const status = await this.loadWorkOrderStatus(workOrderId);
    if (status === 'OPEN') return;
    if (status === 'CANCELLED' || status === 'CLOSED') {
      throw new ConflictException('Work Order sudah dibatalkan atau ditutup');
    }
    throw new ConflictException(
      'Rencana biaya terkunci karena sudah dicek/disetujui. Minta pengembalian status ke OPEN',
    );
  }

  // Jenis biaya yang tidak boleh dilihat pengguna diperlakukan seperti tidak ada.
  private async assertChargeTypeUsable(actor: AuthUser, chargeTypeId: string) {
    const ct = await this.prisma.chargeType.findUnique({
      where: { id: chargeTypeId },
      select: { isActive: true, isHidden: true },
    });
    if (!ct || !ct.isActive || (ct.isHidden && !canSeeHidden(actor))) {
      throw new BadRequestException('Jenis biaya tidak ditemukan atau tidak aktif');
    }
  }

  private async loadPlannedCost(actor: AuthUser, workOrderId: string, id: string) {
    const row = await this.prisma.plannedCost.findFirst({
      where: { id, workOrderItem: { workOrderId } },
      select: { quantity: true, unitCost: true, chargeType: { select: { isHidden: true } } },
    });
    if (!row || (row.chargeType.isHidden && !canSeeHidden(actor))) {
      throw new NotFoundException('Rencana biaya tidak ditemukan pada Work Order ini');
    }
    return row;
  }
}
