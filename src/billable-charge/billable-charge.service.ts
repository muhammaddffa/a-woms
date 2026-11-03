import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { isUniqueViolation } from '../common/constants/role.constant.js';
import { lineTotal, sumDecimals } from '../common/utils/decimal.util.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateBillableChargeDto,
  UpdateBillableChargeDto,
} from './dto/billable-charge.dto.js';

const billableChargeSelect = {
  id: true,
  workOrderItemId: true,
  chargeTypeId: true,
  quantity: true,
  unitPrice: true,
  totalPrice: true,
  invoiceId: true,
  note: true,
  workOrderItem: { select: { lineNo: true, containerNo: true } },
  chargeType: { select: { id: true, code: true, name: true, category: true, isHidden: true } },
} satisfies Prisma.BillableChargeSelect;

const canSeeHidden = (actor: AuthUser) =>
  actor.permissions.includes(PERMISSIONS.CHARGE_VIEW_HIDDEN.code);

@Injectable()
export class BillableChargeService {
  constructor(private readonly prisma: PrismaService) {}

  // Tarif tagih bersifat sensitif (dasar profit): hanya untuk yang mengisinya
  // (billable_charge:manage) atau yang boleh melihat profit (profit:view).
  async list(actor: AuthUser, workOrderId: string) {
    const allowed =
      actor.permissions.includes(PERMISSIONS.BILLABLE_CHARGE_MANAGE.code) ||
      actor.permissions.includes(PERMISSIONS.PROFIT_VIEW.code);
    if (!allowed) throw new ForbiddenException('Anda tidak memiliki akses untuk tindakan ini');

    await this.loadWorkOrderStatus(workOrderId);
    const rows = await this.prisma.billableCharge.findMany({
      where: {
        workOrderItem: { workOrderId },
        ...(canSeeHidden(actor) ? {} : { chargeType: { isHidden: false } }),
      },
      select: billableChargeSelect,
      orderBy: [{ workOrderItem: { lineNo: 'asc' } }, { chargeType: { sortOrder: 'asc' } }],
    });
    return { data: rows, total: sumDecimals(rows.map((r) => r.totalPrice)) };
  }

  async create(actor: AuthUser, workOrderId: string, itemId: string, dto: CreateBillableChargeDto) {
    await this.assertWorkOrderOpenForCharges(workOrderId);

    const item = await this.prisma.workOrderItem.findFirst({
      where: { id: itemId, workOrderId },
      select: { status: true },
    });
    if (!item) throw new NotFoundException('Item tidak ditemukan pada Work Order ini');
    if (item.status !== 'ACTIVE') throw new ConflictException('Item tidak aktif');

    const ct = await this.prisma.chargeType.findUnique({
      where: { id: dto.chargeTypeId },
      select: { isActive: true, isHidden: true },
    });
    if (!ct || !ct.isActive || (ct.isHidden && !canSeeHidden(actor))) {
      throw new BadRequestException('Jenis biaya tidak ditemukan atau tidak aktif');
    }

    const duplicate = await this.prisma.billableCharge.findUnique({
      where: { workOrderItemId_chargeTypeId: { workOrderItemId: itemId, chargeTypeId: dto.chargeTypeId } },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('Tarif untuk jenis ini sudah ada pada item. Ubah barisnya');

    try {
      return await this.prisma.billableCharge.create({
        data: {
          workOrderItemId: itemId,
          chargeTypeId: dto.chargeTypeId,
          quantity: dto.quantity,
          unitPrice: dto.unitPrice,
          totalPrice: lineTotal(dto.quantity, dto.unitPrice),
          note: dto.note,
        },
        select: billableChargeSelect,
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Tarif untuk jenis ini sudah ada pada item');
      throw e;
    }
  }

  async update(actor: AuthUser, workOrderId: string, id: string, dto: UpdateBillableChargeDto) {
    await this.assertWorkOrderOpenForCharges(workOrderId);
    const current = await this.loadCharge(actor, workOrderId, id);

    return this.prisma.billableCharge.update({
      where: { id },
      data: {
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        note: dto.note,
        totalPrice: lineTotal(dto.quantity ?? current.quantity, dto.unitPrice ?? current.unitPrice),
      },
      select: billableChargeSelect,
    });
  }

  async remove(actor: AuthUser, workOrderId: string, id: string) {
    await this.assertWorkOrderOpenForCharges(workOrderId);
    await this.loadCharge(actor, workOrderId, id);
    await this.prisma.billableCharge.delete({ where: { id } });
    return { message: 'Tarif tagih berhasil dihapus' };
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

  // Tarif tetap bisa disesuaikan setelah biaya disetujui (selama belum ditagihkan),
  // tetapi tidak setelah WO dibatalkan atau ditutup.
  private async assertWorkOrderOpenForCharges(workOrderId: string) {
    const status = await this.loadWorkOrderStatus(workOrderId);
    if (status === 'CANCELLED' || status === 'CLOSED') {
      throw new ConflictException('Work Order sudah dibatalkan atau ditutup');
    }
  }

  private async loadCharge(actor: AuthUser, workOrderId: string, id: string) {
    const row = await this.prisma.billableCharge.findFirst({
      where: { id, workOrderItem: { workOrderId } },
      select: {
        quantity: true,
        unitPrice: true,
        invoiceId: true,
        chargeType: { select: { isHidden: true } },
      },
    });
    if (!row || (row.chargeType.isHidden && !canSeeHidden(actor))) {
      throw new NotFoundException('Tarif tagih tidak ditemukan pada Work Order ini');
    }
    if (row.invoiceId !== null) {
      throw new ConflictException('Tarif sudah ditagihkan pada invoice, tidak dapat diubah');
    }
    return row;
  }
}
