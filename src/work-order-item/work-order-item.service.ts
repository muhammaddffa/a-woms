import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueViolation } from '../common/constants/role.constant.js';
import { lockNumberSeries } from '../common/utils/number-generator.util.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateWorkOrderItemDto,
  UpdateWorkOrderItemDto,
} from './dto/work-order-item.dto.js';

export const workOrderItemSelect = {
  id: true,
  workOrderId: true,
  lineNo: true,
  direction: true,
  referenceNo: true,
  loadType: true,
  containerSize: true,
  containerNo: true,
  sealNo: true,
  tare: true,
  actualContainerSize: true,
  stuffingLocation: true,
  positionNote: true,
  positionUpdatedAt: true,
  vehicleId: true,
  driverId: true,
  origin: true,
  destination: true,
  status: true,
  currentPosition: { select: { id: true, code: true, name: true } },
  vehicle: { select: { id: true, plateNo: true } },
  driver: { select: { id: true, name: true } },
} satisfies Prisma.WorkOrderItemSelect;

@Injectable()
export class WorkOrderItemService {
  constructor(private readonly prisma: PrismaService) {}

  // Dipakai juga oleh WorkOrderService saat membuat WO beserta item-nya.
  async assertReferences(items: { vehicleId?: string | null; driverId?: string | null }[]) {
    const vehicleIds = [...new Set(items.map((i) => i.vehicleId).filter((v): v is string => !!v))];
    const driverIds = [...new Set(items.map((i) => i.driverId).filter((v): v is string => !!v))];
    if (vehicleIds.length) {
      const n = await this.prisma.vehicle.count({ where: { id: { in: vehicleIds } } });
      if (n !== vehicleIds.length) throw new BadRequestException('Truk tidak ditemukan');
    }
    if (driverIds.length) {
      const n = await this.prisma.driver.count({ where: { id: { in: driverIds } } });
      if (n !== driverIds.length) throw new BadRequestException('Supir tidak ditemukan');
    }
  }

  async create(workOrderId: string, dto: CreateWorkOrderItemDto) {
    await this.assertWorkOrderEditable(workOrderId);
    await this.assertReferences([dto]);

    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await lockNumberSeries(tx, `woitem:${workOrderId}`);
          const max = await tx.workOrderItem.aggregate({
            where: { workOrderId },
            _max: { lineNo: true },
          });
          return tx.workOrderItem.create({
            data: { ...dto, workOrderId, lineNo: (max._max.lineNo ?? 0) + 1, status: 'ACTIVE' },
            select: workOrderItemSelect,
          });
        });
      } catch (e) {
        if (isUniqueViolation(e) && attempt < 2) continue;
        throw e;
      }
    }
  }

  async update(workOrderId: string, itemId: string, dto: UpdateWorkOrderItemDto) {
    const item = await this.loadItem(workOrderId, itemId);
    await this.assertWorkOrderEditable(workOrderId);

    if (item.status === 'CANCELLED' && dto.status !== 'ACTIVE') {
      throw new ConflictException('Item sudah dibatalkan. Aktifkan kembali untuk mengubahnya');
    }
    if (dto.status === 'CANCELLED' && item.status !== 'CANCELLED') {
      await this.assertNoActiveAdvances(itemId);
    }
    await this.assertReferences([dto]);

    return this.prisma.workOrderItem.update({
      where: { id: itemId },
      data: dto,
      select: workOrderItemSelect,
    });
  }

  async remove(workOrderId: string, itemId: string) {
    await this.loadItem(workOrderId, itemId);
    await this.assertWorkOrderEditable(workOrderId);

    const counts = await this.prisma.workOrderItem.findUniqueOrThrow({
      where: { id: itemId },
      select: { _count: { select: { plannedCosts: true, billableCharges: true, extraCosts: true } } },
    });
    const dependents = Object.values(counts._count).reduce((a, b) => a + b, 0);
    if (dependents > 0) {
      throw new ConflictException(
        'Item sudah memiliki biaya/tarif. Batalkan item (status CANCELLED), jangan dihapus',
      );
    }
    await this.prisma.workOrderItem.delete({ where: { id: itemId } });
    return { message: 'Item berhasil dihapus' };
  }

  // ---------------- aturan ----------------

  private async loadItem(workOrderId: string, itemId: string) {
    const item = await this.prisma.workOrderItem.findFirst({
      where: { id: itemId, workOrderId },
      select: { id: true, status: true },
    });
    if (!item) throw new NotFoundException('Item tidak ditemukan pada Work Order ini');
    return item;
  }

  private async assertWorkOrderEditable(workOrderId: string) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { status: true },
    });
    if (!wo) throw new NotFoundException('Work Order tidak ditemukan');
    if (wo.status === 'CLOSED' || wo.status === 'CANCELLED') {
      throw new ConflictException('Work Order sudah ditutup atau dibatalkan');
    }
  }

  private async assertNoActiveAdvances(itemId: string) {
    const [viaPlanned, viaExtra] = await Promise.all([
      this.prisma.cashAdvanceItem.count({
        where: {
          plannedCost: { workOrderItemId: itemId },
          cashAdvance: { status: { notIn: ['REJECTED', 'CANCELLED'] } },
        },
      }),
      this.prisma.cashAdvanceExtraCost.count({
        where: {
          workOrderItemId: itemId,
          cashAdvance: { status: { notIn: ['REJECTED', 'CANCELLED'] } },
        },
      }),
    ]);
    if (viaPlanned + viaExtra > 0) {
      throw new ConflictException('Item masih dipakai pengajuan dana yang aktif');
    }
  }
}
