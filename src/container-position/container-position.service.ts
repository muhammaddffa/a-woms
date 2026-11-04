import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { workOrderItemSelect } from '../work-order-item/work-order-item.service.js';
import type { SetPositionDto } from './dto/container-position.dto.js';

@Injectable()
export class ContainerPositionService {
  constructor(private readonly prisma: PrismaService) {}

  // Daftar posisi aktif untuk pilihan di layar.
  async listPositions() {
    const data = await this.prisma.containerPosition.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, name: true, sortOrder: true },
    });
    return { data };
  }

  // Posisi tidak berurutan kaku (jalur kontainer bercabang), jadi posisi apa pun boleh dipilih.
  // Setiap perubahan dicatat di container_position_logs dalam satu transaksi.
  async setPosition(actor: AuthUser, workOrderId: string, itemId: string, dto: SetPositionDto) {
    const item = await this.loadItem(workOrderId, itemId);
    if (item.workOrder.status === 'CLOSED' || item.workOrder.status === 'CANCELLED') {
      throw new ConflictException('Work Order sudah ditutup atau dibatalkan');
    }
    if (item.status === 'CANCELLED') {
      throw new ConflictException('Item sudah dibatalkan');
    }

    const position = await this.prisma.containerPosition.findUnique({
      where: { id: dto.positionId },
      select: { id: true, isActive: true },
    });
    if (!position) throw new BadRequestException('Posisi tidak ditemukan');
    if (!position.isActive) throw new BadRequestException('Posisi tidak aktif');

    const note = dto.note || null;
    if (item.currentPositionId === position.id && item.positionNote === note) {
      throw new ConflictException('Posisi dan catatan sudah sama dengan kondisi saat ini');
    }

    await this.prisma.$transaction([
      this.prisma.workOrderItem.update({
        where: { id: itemId },
        data: { currentPositionId: position.id, positionNote: note, positionUpdatedAt: new Date() },
      }),
      this.prisma.containerPositionLog.create({
        data: { workOrderItemId: itemId, positionId: position.id, note, actorId: actor.id },
      }),
    ]);

    return this.prisma.workOrderItem.findUniqueOrThrow({
      where: { id: itemId },
      select: workOrderItemSelect,
    });
  }

  async history(workOrderId: string, itemId: string) {
    await this.loadItem(workOrderId, itemId);
    return this.prisma.containerPositionLog.findMany({
      where: { workOrderItemId: itemId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        note: true,
        createdAt: true,
        position: { select: { id: true, code: true, name: true } },
        actor: { select: { id: true, fullName: true } },
      },
    });
  }

  private async loadItem(workOrderId: string, itemId: string) {
    const item = await this.prisma.workOrderItem.findFirst({
      where: { id: itemId, workOrderId },
      select: {
        id: true,
        status: true,
        currentPositionId: true,
        positionNote: true,
        workOrder: { select: { status: true } },
      },
    });
    if (!item) throw new NotFoundException('Item tidak ditemukan pada Work Order ini');
    return item;
  }
}
