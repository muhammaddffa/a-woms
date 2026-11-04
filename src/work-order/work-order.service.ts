import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/types/auth.types.js';
import { isUniqueViolation } from '../common/constants/role.constant.js';
import { lockNumberSeries, nextNumber } from '../common/utils/number-generator.util.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  WorkOrderItemService,
  workOrderItemSelect,
} from '../work-order-item/work-order-item.service.js';
import type {
  CancelWorkOrderDto,
  CreateWorkOrderDto,
  ListWorkOrdersQuery,
  UpdateWorkOrderDto,
} from './dto/work-order.dto.js';

const woSelect = {
  id: true,
  number: true,
  orderDate: true,
  customerId: true,
  brand: true,
  project: true,
  entityCode: true,
  isDummy: true,
  status: true,
  costNote: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
  _count: { select: { items: true } },
} satisfies Prisma.WorkOrderSelect;

const detailSelect = {
  ...woSelect,
  items: { select: workOrderItemSelect, orderBy: { lineNo: 'asc' } },
} satisfies Prisma.WorkOrderSelect;

// Tanggal dikembalikan sebagai 'YYYY-MM-DD' (tanpa jam) agar tidak bergeser zona waktu.
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const toDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

@Injectable()
export class WorkOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly itemService: WorkOrderItemService,
  ) {}

  async list(query: ListWorkOrdersQuery) {
    const where: Prisma.WorkOrderWhereInput = {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            orderDate: {
              ...(query.dateFrom ? { gte: toDate(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: toDate(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { number: { contains: query.search, mode: 'insensitive' } },
              { project: { contains: query.search, mode: 'insensitive' } },
              { brand: { contains: query.search, mode: 'insensitive' } },
              { customer: { name: { contains: query.search, mode: 'insensitive' } } },
              { items: { some: { containerNo: { contains: query.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.workOrder.findMany({
        where,
        select: woSelect,
        orderBy: [{ orderDate: 'desc' }, { number: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.workOrder.count({ where }),
    ]);
    return {
      data: rows.map((w) => ({ ...w, orderDate: dateOnly(w.orderDate) })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id }, select: detailSelect });
    if (!wo) throw new NotFoundException('Work Order tidak ditemukan');
    return { ...wo, orderDate: dateOnly(wo.orderDate) };
  }

  async create(actor: AuthUser, dto: CreateWorkOrderDto) {
    await this.assertCustomerUsable(dto.customerId);
    await this.itemService.assertReferences(dto.items.map((it) => ({ vehicleId: it.vehicleId, driverId: it.driverId })));

    // Nomor: WO/YYMM/NNNN, urut per bulan menurut tanggal order.
    const prefix = `WO/${dto.orderDate.slice(2, 4)}${dto.orderDate.slice(5, 7)}/`;

    for (let attempt = 0; ; attempt++) {
      try {
        const id = await this.prisma.$transaction(async (tx) => {
          await lockNumberSeries(tx, prefix);
          const last = await tx.workOrder.findFirst({
            where: { number: { startsWith: prefix } },
            orderBy: { number: 'desc' },
            select: { number: true },
          });
          const created = await tx.workOrder.create({
            data: {
              number: nextNumber(prefix, last?.number ?? null),
              orderDate: toDate(dto.orderDate),
              customerId: dto.customerId,
              brand: dto.brand,
              project: dto.project,
              entityCode: dto.entityCode,
              isDummy: dto.isDummy,
              costNote: dto.costNote,
              createdById: actor.id,
              items: {
                create: dto.items.map((it, i) => ({ ...it, lineNo: i + 1, status: 'ACTIVE' as const })),
              },
            },
            select: { id: true },
          });
          return created.id;
        });
        return this.findOne(id);
      } catch (e) {
        if (isUniqueViolation(e) && attempt < 2) continue;
        throw e;
      }
    }
  }

  async update(id: string, dto: UpdateWorkOrderDto) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id }, select: { status: true } });
    if (!wo) throw new NotFoundException('Work Order tidak ditemukan');
    if (wo.status === 'CLOSED' || wo.status === 'CANCELLED') {
      throw new ConflictException('Work Order sudah ditutup atau dibatalkan');
    }
    if (wo.status !== 'OPEN' && (dto.customerId !== undefined || dto.orderDate !== undefined)) {
      throw new ConflictException('Customer dan tanggal tidak dapat diubah setelah biaya dicek');
    }
    if (dto.customerId !== undefined) await this.assertCustomerUsable(dto.customerId);

    const { orderDate, ...rest } = dto;
    await this.prisma.workOrder.update({
      where: { id },
      data: { ...rest, ...(orderDate ? { orderDate: toDate(orderDate) } : {}) },
    });
    return this.findOne(id);
  }

  async cancel(actor: AuthUser, id: string, dto: CancelWorkOrderDto) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id },
      select: { status: true, costNote: true },
    });
    if (!wo) throw new NotFoundException('Work Order tidak ditemukan');
    if (wo.status === 'CANCELLED') throw new ConflictException('Work Order sudah dibatalkan');
    if (wo.status === 'CLOSED') {
      throw new ConflictException('Work Order yang sudah ditutup tidak dapat dibatalkan');
    }

    const active = await this.prisma.cashAdvance.count({
      where: { workOrderId: id, status: { notIn: ['REJECTED', 'CANCELLED'] } },
    });
    if (active > 0) {
      throw new ConflictException(
        `Masih ada ${active} pengajuan dana aktif. Batalkan atau selesaikan terlebih dahulu`,
      );
    }

    const stamp = `[DIBATALKAN ${dateOnly(new Date())} oleh ${actor.username}] ${dto.reason}`;
    await this.prisma.$transaction([
      this.prisma.workOrder.update({
        where: { id },
        data: { status: 'CANCELLED', costNote: wo.costNote ? `${stamp}\n${wo.costNote}` : stamp },
      }),
      this.prisma.workOrderItem.updateMany({
        where: { workOrderId: id },
        data: { status: 'CANCELLED' },
      }),
    ]);
    return this.findOne(id);
  }

  private async assertCustomerUsable(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { isActive: true },
    });
    if (!customer) throw new BadRequestException('Customer tidak ditemukan');
    if (!customer.isActive) throw new BadRequestException('Customer tidak aktif');
  }
}
