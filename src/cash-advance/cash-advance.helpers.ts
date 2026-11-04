import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ApprovalService } from '../approval/approval.service.js';
import type { AuthUser } from '../auth/types/auth.types.js';
import { Prisma } from '../generated/prisma/client.js';
import type {
  AdvanceReturnDirection,
  ApprovalAction,
  ApprovalStep,
  AttachmentKind,
  AttachmentOwnerType,
  CashAdvanceStatus,
} from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';

export type Db = Prisma.TransactionClient;

// Pengajuan yang sudah tidak berlaku tidak dihitung terhadap batas biaya rencana.
export const DEAD_STATUSES: CashAdvanceStatus[] = ['REJECTED', 'CANCELLED'];

// Jenis lampiran yang dihitung sebagai bukti realisasi (bon) pada LPJ.
export const RECEIPT_KINDS: AttachmentKind[] = ['RECEIPT', 'PHOTO', 'PDF'];

export const yymm = (d: Date) =>
  `${String(d.getUTCFullYear() % 100).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

// Status tempat LPJ dimulai/diperbaiki: setelah transfer diverifikasi, atau langsung
// setelah dicairkan bila langkah verifikasi transfer tidak berlaku untuk dokumen ini.
export const reportStartStatus = (required: readonly ApprovalStep[]): CashAdvanceStatus =>
  required.includes('VERIFY_TRANSFER') ? 'TRANSFER_VERIFIED' : 'PAID';

// ---------------------------------------------------------------
// Data inti dokumen
// ---------------------------------------------------------------
export const advanceCoreSelect = {
  id: true,
  number: true,
  status: true,
  advanceType: true,
  workOrderId: true,
  createdById: true,
  holderId: true,
  requiredSteps: true,
} satisfies Prisma.CashAdvanceSelect;

export type AdvanceCore = Prisma.CashAdvanceGetPayload<{ select: typeof advanceCoreSelect }>;

export async function loadCore(db: Db, id: string): Promise<AdvanceCore> {
  const ca = await db.cashAdvance.findUnique({ where: { id }, select: advanceCoreSelect });
  if (!ca) throw new NotFoundException('Pengajuan dana tidak ditemukan');
  return ca;
}

// Perpindahan status bersyarat pada status lama: dua permintaan bersamaan
// tidak bisa sama-sama berhasil.
export async function moveStatus(
  tx: Db,
  id: string,
  from: readonly CashAdvanceStatus[],
  to: CashAdvanceStatus,
  data: Prisma.CashAdvanceUncheckedUpdateManyInput = {},
) {
  const moved = await tx.cashAdvance.updateMany({
    where: { id, status: { in: [...from] } },
    data: { ...data, status: to },
  });
  if (moved.count !== 1) {
    throw new ConflictException('Status dokumen baru saja berubah. Muat ulang lalu coba lagi');
  }
}

// ---------------------------------------------------------------
// Pemisahan tugas
// ---------------------------------------------------------------
const ROLE_LABEL = {
  creator: 'pembuat pengajuan',
  holder: 'pemegang dana',
  checker: 'pemeriksa pengajuan',
  approver: 'penyetuju pengajuan',
  payer: 'pembayar dana',
  verifier: 'pemverifikasi transfer',
  reportChecker: 'pemeriksa LPJ',
} as const;

export type DutyRole = keyof typeof ROLE_LABEL;

const HISTORY_STEP: Partial<Record<DutyRole, ApprovalStep>> = {
  checker: 'CHECK',
  approver: 'APPROVE',
  payer: 'PAY',
  verifier: 'VERIFY_TRANSFER',
  reportChecker: 'REPORT_CHECK',
};

export async function assertSegregation(
  db: Db,
  actorId: string,
  ca: Pick<AdvanceCore, 'id' | 'createdById' | 'holderId'>,
  forbidden: readonly DutyRole[],
  label: string,
) {
  for (const role of forbidden) {
    let userId: string | null;
    if (role === 'creator') userId = ca.createdById;
    else if (role === 'holder') userId = ca.holderId;
    else {
      const last = await db.approvalHistory.findFirst({
        where: { docType: 'CASH_ADVANCE', docId: ca.id, step: HISTORY_STEP[role]!, action: 'DONE' },
        orderBy: [{ actedAt: 'desc' }, { id: 'desc' }],
        select: { actorId: true },
      });
      userId = last?.actorId ?? null;
    }
    if (userId === actorId) {
      throw new ForbiddenException(
        `${label} tidak boleh orang yang sama dengan ${ROLE_LABEL[role]} (pemisahan tugas)`,
      );
    }
  }
}

// ---------------------------------------------------------------
// Satu langkah alur: validasi status -> pemisahan tugas -> pemeriksaan tambahan
// -> perpindahan status -> riwayat, semuanya dalam satu transaksi.
// ---------------------------------------------------------------
export interface StepDeps {
  prisma: PrismaService;
  approvals: ApprovalService;
}

export interface StepOptions {
  allowedFrom: readonly CashAdvanceStatus[];
  to: CashAdvanceStatus | ((ca: AdvanceCore) => CashAdvanceStatus);
  step: ApprovalStep;
  action?: ApprovalAction;
  note?: string | null;
  forbid: readonly DutyRole[];
  label: string;
  // Pemeriksaan tambahan; boleh mengembalikan data yang ikut disimpan bersama status.
  prepare?: (tx: Db, ca: AdvanceCore) => Promise<Prisma.CashAdvanceUncheckedUpdateManyInput | void>;
  // Dijalankan setelah status berpindah (mis. membuat tagihan), masih di transaksi yang sama.
  afterMove?: (tx: Db, ca: AdvanceCore) => Promise<void>;
}

export async function runStep(deps: StepDeps, actor: AuthUser, id: string, o: StepOptions): Promise<void> {
  const ca = await loadCore(deps.prisma, id);
  if (!o.allowedFrom.includes(ca.status)) {
    throw new ConflictException(
      `Aksi ini hanya dapat dilakukan saat status ${o.allowedFrom.join(' / ')}. Status saat ini: ${ca.status}`,
    );
  }
  await deps.prisma.$transaction(async (tx) => {
    await assertSegregation(tx, actor.id, ca, o.forbid, o.label);
    const extra = (await o.prepare?.(tx, ca)) ?? {};
    await moveStatus(tx, id, [ca.status], typeof o.to === 'function' ? o.to(ca) : o.to, extra);
    await deps.approvals.record(tx, {
      docType: 'CASH_ADVANCE',
      docId: id,
      step: o.step,
      action: o.action ?? 'DONE',
      actorId: actor.id,
      note: o.note ?? null,
    });
    await o.afterMove?.(tx, ca);
  });
}

// ---------------------------------------------------------------
// Saldo dan penyelesaian
//   selisih = dana diberikan - realisasi - biaya di luar rencana
//   > 0 : sisa, dikembalikan staf ke perusahaan
//   < 0 : kekurangan, diganti perusahaan ke staf
// ---------------------------------------------------------------
export interface Settlement {
  advanceTotal: Prisma.Decimal;
  actualTotal: Prisma.Decimal;
  extraTotal: Prisma.Decimal;
  balance: Prisma.Decimal;
  direction: AdvanceReturnDirection | null;
  due: Prisma.Decimal; // |selisih|
  received: Prisma.Decimal; // sudah dikonfirmasi (RECEIVED)
  pending: Prisma.Decimal; // dokumen pengembalian masih DRAFT
  outstanding: Prisma.Decimal; // due - received
}

export async function loadSettlement(db: Db, id: string): Promise<Settlement> {
  const items = await db.cashAdvanceItem.aggregate({
    where: { cashAdvanceId: id },
    _sum: { advanceAmount: true, actualAmount: true },
  });
  const extras = await db.cashAdvanceExtraCost.aggregate({
    where: { cashAdvanceId: id },
    _sum: { amount: true },
  });
  const returns = await db.advanceReturnItem.findMany({
    where: { cashAdvanceId: id, advanceReturn: { status: { in: ['DRAFT', 'RECEIVED'] } } },
    select: { amount: true, advanceReturn: { select: { status: true } } },
  });

  const zero = new Prisma.Decimal(0);
  const advanceTotal = items._sum.advanceAmount ?? zero;
  const actualTotal = items._sum.actualAmount ?? zero;
  const extraTotal = extras._sum.amount ?? zero;
  const balance = advanceTotal.sub(actualTotal).sub(extraTotal);
  const due = balance.abs();
  const sumBy = (status: 'DRAFT' | 'RECEIVED') =>
    returns.filter((r) => r.advanceReturn.status === status).reduce((a, r) => a.add(r.amount), zero);
  const received = sumBy('RECEIVED');
  return {
    advanceTotal,
    actualTotal,
    extraTotal,
    balance,
    direction: balance.gt(0) ? 'RETURN_TO_COMPANY' : balance.lt(0) ? 'REIMBURSE_STAFF' : null,
    due,
    received,
    pending: sumBy('DRAFT'),
    outstanding: due.sub(received),
  };
}

// ---------------------------------------------------------------
// Kelengkapan dokumen LPJ
// ---------------------------------------------------------------
interface ReadinessAdvance {
  id: string;
  items: {
    id: string;
    actualAmount: Prisma.Decimal | null;
    plannedCost: { chargeType: { code: string }; workOrderItem: { lineNo: number } };
  }[];
  extraCosts: { id: string; description: string }[];
}

export function missingDocuments(
  ca: ReadinessAdvance,
  attachments: { ownerType: AttachmentOwnerType; ownerId: string; kind: AttachmentKind }[],
): string[] {
  const has = (type: AttachmentOwnerType, id: string, kinds: AttachmentKind[]) =>
    attachments.some((a) => a.ownerType === type && a.ownerId === id && kinds.includes(a.kind));
  const missing: string[] = [];
  if (!has('CASH_ADVANCE', ca.id, ['TRANSFER_PROOF'])) {
    missing.push('Bukti transfer dana dari Keuangan belum ada');
  }
  for (const item of ca.items) {
    const label = `Item ${item.plannedCost.workOrderItem.lineNo} (${item.plannedCost.chargeType.code})`;
    if (item.actualAmount === null) missing.push(`${label}: realisasi belum diisi`);
    else if (item.actualAmount.gt(0) && !has('CASH_ADVANCE_ITEM', item.id, RECEIPT_KINDS)) {
      missing.push(`${label}: bon/bukti belum diunggah`);
    }
  }
  for (const extra of ca.extraCosts) {
    if (!has('CASH_ADVANCE_EXTRA_COST', extra.id, RECEIPT_KINDS)) {
      missing.push(`Biaya di luar rencana "${extra.description}": bukti belum diunggah`);
    }
  }
  return missing;
}
