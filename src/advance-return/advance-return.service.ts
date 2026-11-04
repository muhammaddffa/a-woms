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
import { lockNumberSeries, nextNumber } from '../common/utils/number-generator.util.js';
import { loadSettlement, moveStatus, yymm } from '../cash-advance/cash-advance.helpers.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateAdvanceReturnDto, ListAdvanceReturnsQuery } from './dto/advance-return.dto.js';

// Penyelesaian selisih dana setelah LPJ disetujui. Satu dokumen, dua arah:
//   RETURN_TO_COMPANY : ada sisa; staf mengembalikan ke perusahaan.
//       dibuat oleh pemegang dana (advance_return:create), dikonfirmasi Keuangan (advance_return:receive)
//   REIMBURSE_STAFF   : ada kekurangan; perusahaan mengganti ke staf.
//       dibuat Keuangan (cash_advance:pay), dikonfirmasi Checker (cash_advance:verify_transfer)
// Kedua arah wajib bukti transfer, dan pengonfirmasi tidak boleh orang yang membuat dokumen.
@Injectable()
export class AdvanceReturnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalService,
  ) {}

  async list(query: ListAdvanceReturnsQuery) {
    const where: Prisma.AdvanceReturnWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.cashAdvanceId && { items: { some: { cashAdvanceId: query.cashAdvanceId } } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.advanceReturn.findMany({
        where,
        select: {
          id: true,
          number: true,
          direction: true,
          returnDate: true,
          returnedBy: true,
          status: true,
          createdAt: true,
          items: { select: { amount: true, cashAdvance: { select: { id: true, number: true } } } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.advanceReturn.count({ where }),
    ]);
    return { data: rows, total, page: query.page, limit: query.limit };
  }

  async findOne(id: string) {
    const ret = await this.prisma.advanceReturn.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        direction: true,
        returnDate: true,
        returnedBy: true,
        status: true,
        note: true,
        createdAt: true,
        createdBy: { select: { id: true, fullName: true } },
        cashAccount: { select: { id: true, code: true, name: true } },
        items: { select: { id: true, amount: true, cashAdvance: { select: { id: true, number: true, status: true } } } },
      },
    });
    if (!ret) throw new NotFoundException('Dokumen pengembalian tidak ditemukan');
    const attachments = await this.prisma.attachment.findMany({
      where: { ownerType: 'ADVANCE_RETURN', ownerId: id },
      select: { id: true, kind: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true },
      orderBy: { uploadedAt: 'asc' },
    });
    return { ...ret, attachments };
  }

  history(actor: AuthUser, id: string) {
    return this.approvals.list(actor, 'ADVANCE_RETURN', id);
  }

  async create(actor: AuthUser, dto: CreateAdvanceReturnDto) {
    if (dto.cashAccountId) {
      const acc = await this.prisma.cashAccount.findUnique({ where: { id: dto.cashAccountId }, select: { id: true } });
      if (!acc) throw new BadRequestException('Rekening kas/bank tidak ditemukan');
    }
    const prefix = `RT/${yymm(dto.returnDate)}/`;

    const id = await this.prisma.$transaction(async (tx) => {
      // Kunci baris pengajuan agar dua pengembalian bersamaan tidak melebihi selisih.
      const ids = dto.items.map((i) => i.cashAdvanceId).sort();
      await tx.$queryRaw`SELECT id FROM cash_advances WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
      const advances = await tx.cashAdvance.findMany({ where: { id: { in: ids } }, select: { id: true, number: true, status: true } });
      if (advances.length !== ids.length) throw new BadRequestException('Ada pengajuan dana yang tidak ditemukan');

      const directions = new Set<string>();
      for (const item of dto.items) {
        const ca = advances.find((a) => a.id === item.cashAdvanceId)!;
        if (ca.status !== 'REPORT_APPROVED') {
          throw new ConflictException(`Pengajuan ${ca.number} belum berstatus REPORT_APPROVED`);
        }
        const s = await loadSettlement(tx, ca.id);
        if (!s.direction) throw new ConflictException(`Pengajuan ${ca.number} tidak memiliki selisih dana`);
        directions.add(s.direction);
        const available = s.outstanding.sub(s.pending);
        if (new Prisma.Decimal(item.amount).gt(available)) {
          throw new ConflictException(
            `Jumlah untuk ${ca.number} melebihi sisa yang harus diselesaikan. Sisa yang dapat dicatat: ${available.toFixed(2)}`,
          );
        }
      }
      if (directions.size !== 1) {
        throw new BadRequestException('Satu dokumen hanya untuk satu arah (pengembalian atau penggantian)');
      }
      const direction = [...directions][0] as 'RETURN_TO_COMPANY' | 'REIMBURSE_STAFF';

      const can = (code: string) => actor.permissions.includes(code);
      const allowed =
        direction === 'RETURN_TO_COMPANY'
          ? can(PERMISSIONS.ADVANCE_RETURN_CREATE.code)
          : can(PERMISSIONS.CASH_ADVANCE_PAY.code);
      if (!allowed) throw new ForbiddenException('Anda tidak memiliki akses untuk tindakan ini');

      await lockNumberSeries(tx, prefix);
      const last = await tx.advanceReturn.findFirst({
        where: { number: { startsWith: prefix } },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      const created = await tx.advanceReturn.create({
        data: {
          number: nextNumber(prefix, last?.number ?? null),
          direction,
          returnDate: dto.returnDate,
          returnedBy: dto.returnedBy,
          cashAccountId: dto.cashAccountId,
          note: dto.note,
          createdById: actor.id,
          items: { create: dto.items.map((i) => ({ cashAdvanceId: i.cashAdvanceId, amount: i.amount })) },
        },
        select: { id: true },
      });
      return created.id;
    });
    return this.findOne(id);
  }

  // Konfirmasi penerimaan dana (dengan bukti transfer). Bila selisih sudah lunas,
  // pengajuan yang bersangkutan menjadi SETTLED.
  async receive(actor: AuthUser, id: string, note?: string) {
    const ret = await this.prisma.advanceReturn.findUnique({
      where: { id },
      select: { id: true, status: true, direction: true, createdById: true, items: { select: { cashAdvanceId: true } } },
    });
    if (!ret) throw new NotFoundException('Dokumen pengembalian tidak ditemukan');
    if (ret.status !== 'DRAFT') {
      throw new ConflictException(`Aksi ini hanya dapat dilakukan saat status DRAFT. Status saat ini: ${ret.status}`);
    }
    const needed =
      ret.direction === 'RETURN_TO_COMPANY'
        ? PERMISSIONS.ADVANCE_RETURN_RECEIVE.code
        : PERMISSIONS.CASH_ADVANCE_VERIFY_TRANSFER.code;
    if (!actor.permissions.includes(needed)) throw new ForbiddenException('Anda tidak memiliki akses untuk tindakan ini');
    if (ret.createdById === actor.id) {
      throw new ForbiddenException('Pengonfirmasi tidak boleh orang yang membuat dokumen pengembalian (pemisahan tugas)');
    }
    const proofs = await this.prisma.attachment.count({
      where: { ownerType: 'ADVANCE_RETURN', ownerId: id, kind: 'TRANSFER_PROOF' },
    });
    if (proofs === 0) throw new ConflictException('Bukti transfer belum diunggah');

    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.advanceReturn.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'RECEIVED' } });
      if (moved.count !== 1) throw new ConflictException('Status dokumen baru saja berubah. Muat ulang lalu coba lagi');
      await this.approvals.record(tx, { docType: 'ADVANCE_RETURN', docId: id, step: 'RECEIVE', action: 'DONE', actorId: actor.id, note });

      const ids = ret.items.map((i) => i.cashAdvanceId).sort();
      await tx.$queryRaw`SELECT id FROM cash_advances WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
      for (const cashAdvanceId of ids) {
        const s = await loadSettlement(tx, cashAdvanceId);
        if (s.outstanding.lte(0)) {
          await moveStatus(tx, cashAdvanceId, ['REPORT_APPROVED'], 'SETTLED');
          await this.approvals.record(tx, { docType: 'CASH_ADVANCE', docId: cashAdvanceId, step: 'RECEIVE', action: 'DONE', actorId: actor.id, note: 'Selisih dana lunas' });
        }
      }
    });
    return this.findOne(id);
  }

  async cancel(actor: AuthUser, id: string, reason: string) {
    const ret = await this.prisma.advanceReturn.findUnique({ where: { id }, select: { status: true, createdById: true } });
    if (!ret) throw new NotFoundException('Dokumen pengembalian tidak ditemukan');
    if (ret.createdById !== actor.id) throw new ForbiddenException('Hanya pembuat dokumen yang dapat membatalkannya');
    if (ret.status !== 'DRAFT') throw new ConflictException(`Hanya dokumen DRAFT yang dapat dibatalkan. Status saat ini: ${ret.status}`);
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.advanceReturn.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'CANCELLED' } });
      if (moved.count !== 1) throw new ConflictException('Status dokumen baru saja berubah. Muat ulang lalu coba lagi');
      await this.approvals.record(tx, { docType: 'ADVANCE_RETURN', docId: id, step: 'RECEIVE', action: 'REVERT', actorId: actor.id, note: reason });
    });
    return this.findOne(id);
  }
}
