import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { RECEIPT_KINDS, reportStartStatus } from '../cash-advance/cash-advance.helpers.js';
import type { AttachmentKind, AttachmentOwnerType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MAX_FILE_BYTES, type ListAttachmentsQuery, type UploadAttachmentDto, type UploadedBlob } from './dto/attachment.dto.js';
import { StorageService } from './storage.service.js';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const MAX_PER_OWNER = 10;

// Isi file harus cocok dengan jenis yang diklaim (bukan hanya percaya pada header dari klien).
function matchesSignature(mime: string, b: Buffer): boolean {
  switch (mime) {
    case 'image/jpeg':
      return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'image/png':
      return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'application/pdf':
      return b.subarray(0, 5).toString('latin1') === '%PDF-';
    case 'image/webp':
      return b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
    default:
      return false;
  }
}

const cleanName = (name: string) =>
  // eslint-disable-next-line no-control-regex
  basename(name).replace(/[\u0000-\u001f"\\/]/g, '_').slice(0, 200) || 'file';

const attachmentSelect = {
  id: true,
  ownerType: true,
  ownerId: true,
  kind: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  uploadedAt: true,
  uploadedBy: { select: { id: true, fullName: true } },
} as const;

@Injectable()
export class AttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(actor: AuthUser, dto: UploadAttachmentDto, file: UploadedBlob | undefined) {
    if (!file) throw new BadRequestException('File wajib diunggah');
    const ext = EXTENSIONS[file.mimetype];
    if (!ext || file.size > MAX_FILE_BYTES || !matchesSignature(file.mimetype, file.buffer)) {
      throw new BadRequestException('File harus JPG, PNG, WebP, atau PDF dengan ukuran maksimal 5 MB');
    }
    await this.assertCanModify(actor, dto.ownerType, dto.ownerId, dto.kind);

    const count = await this.prisma.attachment.count({ where: { ownerType: dto.ownerType, ownerId: dto.ownerId } });
    if (count >= MAX_PER_OWNER) throw new ConflictException(`Maksimal ${MAX_PER_OWNER} lampiran per dokumen`);

    const now = new Date();
    const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;
    await this.storage.put(key, file.buffer);
    try {
      return await this.prisma.attachment.create({
        data: {
          ownerType: dto.ownerType,
          ownerId: dto.ownerId,
          kind: dto.kind,
          storageKey: key,
          fileName: cleanName(file.originalname),
          mimeType: file.mimetype,
          sizeBytes: file.size,
          uploadedById: actor.id,
        },
        select: attachmentSelect,
      });
    } catch (e) {
      await this.storage.remove(key);
      throw e;
    }
  }

  list(query: ListAttachmentsQuery) {
    return this.prisma.attachment.findMany({
      where: { ownerType: query.ownerType, ownerId: query.ownerId },
      select: attachmentSelect,
      orderBy: [{ uploadedAt: 'asc' }, { id: 'asc' }],
    });
  }

  async open(id: string) {
    const row = await this.prisma.attachment.findUnique({
      where: { id },
      select: { storageKey: true, mimeType: true, fileName: true },
    });
    if (!row) throw new NotFoundException('Lampiran tidak ditemukan');
    return { stream: this.storage.open(row.storageKey), mimeType: row.mimeType ?? 'application/octet-stream', fileName: row.fileName ?? 'file' };
  }

  // Hanya pengunggah, dan hanya selagi dokumen pemiliknya masih boleh diubah.
  async remove(actor: AuthUser, id: string) {
    const row = await this.prisma.attachment.findUnique({
      where: { id },
      select: { id: true, ownerType: true, ownerId: true, kind: true, storageKey: true, uploadedById: true },
    });
    if (!row) throw new NotFoundException('Lampiran tidak ditemukan');
    if (row.uploadedById !== actor.id) throw new ForbiddenException('Hanya pengunggah yang dapat menghapus lampiran');
    await this.assertCanModify(actor, row.ownerType, row.ownerId, row.kind);
    await this.prisma.attachment.delete({ where: { id } });
    await this.storage.remove(row.storageKey);
    return { message: 'Lampiran berhasil dihapus' };
  }

  // Dipakai saat dokumen pemilik dihapus (mis. biaya di luar rencana).
  async removeForOwner(ownerType: AttachmentOwnerType, ownerId: string) {
    const rows = await this.prisma.attachment.findMany({ where: { ownerType, ownerId }, select: { id: true, storageKey: true } });
    await this.prisma.attachment.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    await Promise.all(rows.map((r) => this.storage.remove(r.storageKey)));
  }

  // Siapa boleh menambah/menghapus lampiran pada dokumen apa, dan pada status apa.
  private async assertCanModify(actor: AuthUser, ownerType: AttachmentOwnerType, ownerId: string, kind: AttachmentKind) {
    const deny = () => new ForbiddenException('Anda tidak memiliki akses untuk tindakan ini');

    if (ownerType === 'CASH_ADVANCE') {
      if (kind !== 'TRANSFER_PROOF') throw new BadRequestException('Lampiran pengajuan hanya berupa bukti transfer');
      const ca = await this.prisma.cashAdvance.findUnique({ where: { id: ownerId }, select: { status: true } });
      if (!ca) throw new NotFoundException('Pengajuan dana tidak ditemukan');
      if (!['APPROVED', 'PAID'].includes(ca.status)) {
        throw new ConflictException('Bukti transfer hanya dapat diubah saat status APPROVED atau PAID');
      }
      if (!actor.permissions.includes(PERMISSIONS.CASH_ADVANCE_PAY.code)) throw deny();
      return;
    }

    if (ownerType === 'CASH_ADVANCE_ITEM' || ownerType === 'CASH_ADVANCE_EXTRA_COST') {
      if (!RECEIPT_KINDS.includes(kind)) throw new BadRequestException('Bukti realisasi berupa bon (RECEIPT), foto, atau PDF');
      const owner =
        ownerType === 'CASH_ADVANCE_ITEM'
          ? await this.prisma.cashAdvanceItem.findUnique({ where: { id: ownerId }, select: { cashAdvance: { select: { status: true, holderId: true, requiredSteps: true } } } })
          : await this.prisma.cashAdvanceExtraCost.findUnique({ where: { id: ownerId }, select: { cashAdvance: { select: { status: true, holderId: true, requiredSteps: true } } } });
      if (!owner) throw new NotFoundException('Baris pengajuan tidak ditemukan');
      const ca = owner.cashAdvance;
      if (ca.holderId !== actor.id) throw new ForbiddenException('Hanya pemegang dana yang dapat mengunggah bukti realisasi');
      const open = reportStartStatus(ca.requiredSteps);
      if (ca.status !== open) throw new ConflictException(`Bukti hanya dapat diubah saat LPJ terbuka (status ${open})`);
      return;
    }

    if (ownerType === 'ADVANCE_RETURN') {
      if (kind !== 'TRANSFER_PROOF') throw new BadRequestException('Lampiran pengembalian hanya berupa bukti transfer');
      const ret = await this.prisma.advanceReturn.findUnique({ where: { id: ownerId }, select: { status: true, createdById: true } });
      if (!ret) throw new NotFoundException('Dokumen pengembalian tidak ditemukan');
      if (ret.status !== 'DRAFT') throw new ConflictException('Bukti transfer hanya dapat diubah saat dokumen masih DRAFT');
      if (ret.createdById !== actor.id) throw deny();
      return;
    }

    throw new BadRequestException('Jenis dokumen pemilik belum didukung');
  }
}
