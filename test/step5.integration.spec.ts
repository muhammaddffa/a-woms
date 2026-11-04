import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { AdvanceReturnService } from '../src/advance-return/advance-return.service.js';
import { ApprovalService } from '../src/approval/approval.service.js';
import { AttachmentService } from '../src/attachment/attachment.service.js';
import { StorageService } from '../src/attachment/storage.service.js';
import type { AuthUser } from '../src/auth/types/auth.types.js';
import { CashAdvanceReportService } from '../src/cash-advance/cash-advance-report.service.js';
import { CashAdvanceService } from '../src/cash-advance/cash-advance.service.js';
import { PERMISSIONS as P, PERMISSION_LIST } from '../src/common/constants/permission.constant.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { WorkflowSettingService } from '../src/workflow-setting/workflow-setting.service.js';


// Uji ini MENGOSONGKAN tabel. Jalankan hanya pada database khusus uji.
if (!/test/i.test(process.env.DATABASE_URL ?? '')) {
  throw new Error('DATABASE_URL harus mengarah ke database uji (nama berisi "test"); uji ini mengosongkan tabel.');
}

process.env.UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/tmp/wms-test-uploads';
const prisma = new PrismaService();
const approvals = new ApprovalService(prisma);
const workflow = new WorkflowSettingService(prisma);
const attachments = new AttachmentService(prisma, new StorageService());
const advances = new CashAdvanceService(prisma, approvals, workflow);
const report = new CashAdvanceReportService(prisma, approvals, advances, attachments);
const returns = new AdvanceReturnService(prisma, approvals);

const codes = (...l: { code: string }[]) => l.map((p) => p.code);
const OPS = codes(P.CASH_ADVANCE_VIEW, P.CASH_ADVANCE_CREATE, P.CASH_ADVANCE_SUBMIT_REPORT, P.ADVANCE_RETURN_CREATE, P.ATTACHMENT_UPLOAD);
const CHECKER = codes(P.CASH_ADVANCE_VIEW, P.CASH_ADVANCE_CHECK, P.CASH_ADVANCE_VERIFY_TRANSFER, P.CASH_ADVANCE_CHECK_REPORT);
const DIRECTOR = codes(P.CASH_ADVANCE_VIEW, P.CASH_ADVANCE_APPROVE, P.CASH_ADVANCE_APPROVE_REPORT, P.WORKFLOW_MANAGE);
const FINANCE = codes(P.CASH_ADVANCE_VIEW, P.CASH_ADVANCE_PAY, P.ADVANCE_RETURN_RECEIVE, P.ATTACHMENT_UPLOAD);
const ALL = PERMISSION_LIST.map((p) => p.code);

let ops: AuthUser, ops2: AuthUser, checker: AuthUser, director: AuthUser, director2: AuthUser, finance: AuthUser;
let ct: Record<string, string>;
let customerId: string;
let seq = 0;

const as = (u: AuthUser, permissions: string[]): AuthUser => ({ ...u, permissions });
const png = () => ({ originalname: 'bon.png', mimetype: 'image/png', size: 16, buffer: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8, 1)]) });
const num = (v: unknown) => Number(String(v));

async function mkUser(username: string, permissions: string[]): Promise<AuthUser> {
  const u = await prisma.user.create({ data: { username, fullName: username, passwordHash: 'x' } });
  return { id: u.id, username, fullName: username, roles: [], permissions };
}

beforeAll(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE workflow_setting_logs, workflow_settings, approval_history, attachments, advance_return_items, advance_returns, cash_advance_extra_costs, cash_advance_items, cash_advances, billable_charges, planned_costs, work_order_items, work_orders, customers, charge_types, cash_accounts, users RESTART IDENTITY CASCADE',
  );
  ops = await mkUser('ops', OPS);
  ops2 = await mkUser('ops2', OPS);
  checker = await mkUser('checker', CHECKER);
  director = await mkUser('director', DIRECTOR);
  director2 = await mkUser('director2', DIRECTOR);
  finance = await mkUser('finance', FINANCE);
  const types = [
    { code: 'FUEL', category: 'UANG_JALAN', billingMode: 'AT_COST' as const, useActualCost: true, sortOrder: 1 },
    { code: 'TOLL', category: 'UANG_JALAN', billingMode: 'AT_COST' as const, useActualCost: true, sortOrder: 2 },
    { code: 'MEALS', category: 'UANG_JALAN', billingMode: 'AT_COST' as const, useActualCost: true, sortOrder: 3 },
    { code: 'LOLO', category: 'LOLO', billingMode: 'AT_COST' as const, useActualCost: true, sortOrder: 11 },
    { code: 'HANDLING', category: 'HANDLING', billingMode: 'FIXED' as const, sortOrder: 12 },
    { code: 'TRUCKING', category: 'TRUCKING', billingMode: 'FIXED' as const, isTrucking: true, sortOrder: 10 },
  ];
  ct = {};
  for (const t of types) ct[t.code] = (await prisma.chargeType.create({ data: { ...t, name: t.code } })).id;
  customerId = (await prisma.customer.create({ data: { code: 'C1', name: 'PT Uji' } })).id;
  await prisma.cashAccount.create({ data: { code: 'BANK', name: 'Bank' } });
});
afterAll(async () => prisma.$disconnect());

// WO berstatus COST_APPROVED dengan satu item dan biaya rencana sesuai parameter.
async function makeWo(costs: Record<string, number | { amount: number; bearer: 'COMPANY' | 'VENDOR' | 'DEDUCT_FROM_VENDOR' }>, status: 'OPEN' | 'COST_APPROVED' = 'COST_APPROVED') {
  const wo = await prisma.workOrder.create({ data: { number: `WO-T-${++seq}`, orderDate: new Date(), customerId, status, createdById: ops.id } });
  const item = await prisma.workOrderItem.create({ data: { workOrderId: wo.id, lineNo: 1, status: 'ACTIVE' } });
  const pc: Record<string, string> = {};
  for (const [code, v] of Object.entries(costs)) {
    const amount = typeof v === 'number' ? v : v.amount;
    pc[code] = (await prisma.plannedCost.create({
      data: { workOrderItemId: item.id, chargeTypeId: ct[code], quantity: 1, unitCost: amount, totalCost: amount, bearer: typeof v === 'number' ? 'COMPANY' : v.bearer, createdById: ops.id },
    })).id;
  }
  return { woId: wo.id, itemId: item.id, pc };
}

const today = '2026-11-03';
const dateOf = (s = today) => new Date(`${s}T00:00:00.000Z`);
const createUJ = (woId: string, items: [string, number][], actor = ops) =>
  advances.create(actor, { workOrderId: woId, advanceType: 'DRIVER_ALLOWANCE', advanceDate: dateOf(), recipient: 'Supir', items: items.map(([plannedCostId, advanceAmount]) => ({ plannedCostId, advanceAmount })) });
const createCB = (woId: string, items: [string, number][], actor = ops) =>
  advances.create(actor, { workOrderId: woId, advanceType: 'OPERATIONAL', advanceDate: dateOf(), recipient: 'Staf', items: items.map(([plannedCostId, advanceAmount]) => ({ plannedCostId, advanceAmount })) });

const upload = (actor: AuthUser, ownerType: any, ownerId: string, kind: any) => attachments.upload(actor, { ownerType, ownerId, kind }, png());
const accId = async () => (await prisma.cashAccount.findFirstOrThrow()).id;

// Sampai LPJ terbuka: cek -> setujui -> bukti + bayar -> verifikasi transfer
async function driveToReportOpen(id: string) {
  await advances.check(checker, id);
  await advances.approve(director, id);
  await upload(finance, 'CASH_ADVANCE', id, 'TRANSFER_PROOF');
  await advances.pay(finance, id, { cashAccountId: await accId(), transferFee: 6500 });
  await advances.verifyTransfer(checker, id);
}
// Isi realisasi + bukti, lalu ajukan LPJ
async function fillAndSubmit(id: string, actuals: number[], holder = ops) {
  const d = await advances.findOne(id);
  await report.saveActuals(holder, id, { items: d.items.map((it, i) => ({ itemId: it.id, actualAmount: actuals[i] })) });
  for (const [i, it] of d.items.entries()) if (actuals[i] > 0) await upload(holder, 'CASH_ADVANCE_ITEM', it.id, 'RECEIPT');
  await report.submit(holder, id);
}
const status = async (id: string) => (await prisma.cashAdvance.findUniqueOrThrow({ where: { id } })).status;
const billable = async (itemId: string, code: string) =>
  prisma.billableCharge.findUnique({ where: { workOrderItemId_chargeTypeId: { workOrderItemId: itemId, chargeTypeId: ct[code] } } });
const rejectsWith = async (p: Promise<unknown>, cls: any, part?: string) => {
  const err: any = await p.then(() => null, (e) => e);
  expect(err, 'seharusnya ditolak').toBeInstanceOf(cls);
  if (part) expect(String(err.message)).toContain(part);
  return err;
};

describe('Alur utama uang jalan: sisa dikembalikan, tagihan sesuai realisasi', () => {
  it('berjalan dari pengajuan sampai SETTLED', async () => {
    const w = await makeWo({ FUEL: 600000, TOLL: 250000 });
    // tarif manual sebelumnya untuk FUEL (estimasi) harus diganti realisasi
    await prisma.billableCharge.create({ data: { workOrderItemId: w.itemId, chargeTypeId: ct.FUEL, quantity: 1, unitPrice: 700000, totalPrice: 700000 } });
    await prisma.billableCharge.create({ data: { workOrderItemId: w.itemId, chargeTypeId: ct.TRUCKING, quantity: 1, unitPrice: 2000000, totalPrice: 2000000 } });

    const ca = await createUJ(w.woId, [[w.pc.FUEL, 600000], [w.pc.TOLL, 250000]]);
    expect(ca.number).toMatch(/^UJ\/2611\/\d{4}$/);
    expect(ca.status).toBe('DRAFT');
    expect(ca.requiredSteps).toEqual(['CHECK', 'VERIFY_TRANSFER', 'REPORT_CHECK']);
    expect(ca.holder?.id).toBe(ops.id);

    await advances.check(checker, ca.id);
    expect(await status(ca.id)).toBe('CHECKED');
    await advances.approve(director, ca.id);
    expect(await status(ca.id)).toBe('APPROVED');

    // bayar tanpa bukti transfer ditolak
    await rejectsWith(advances.pay(finance, ca.id, { cashAccountId: await accId() }), ConflictException, 'Bukti transfer belum diunggah');
    await upload(finance, 'CASH_ADVANCE', ca.id, 'TRANSFER_PROOF');
    await advances.pay(finance, ca.id, { cashAccountId: await accId(), transferFee: 6500 });
    expect(await status(ca.id)).toBe('PAID');

    // LPJ belum boleh dimulai sebelum transfer diverifikasi
    await rejectsWith(report.saveActuals(ops, ca.id, { items: [{ itemId: ca.items[0].id, actualAmount: 1 }] }), ConflictException, 'TRANSFER_VERIFIED');
    await advances.verifyTransfer(checker, ca.id);
    expect(await status(ca.id)).toBe('TRANSFER_VERIFIED');

    // dokumen belum lengkap -> LPJ ditolak beserta daftar yang kurang
    const err = await rejectsWith(report.submit(ops, ca.id), ConflictException, 'belum lengkap');
    expect(err.getResponse().missing.length).toBe(2);

    const d = await advances.findOne(ca.id);
    const fuel = d.items.find((i) => i.plannedCost.chargeType.code === 'FUEL')!;
    const toll = d.items.find((i) => i.plannedCost.chargeType.code === 'TOLL')!;
    await report.saveActuals(ops, ca.id, { items: [{ itemId: fuel.id, actualAmount: 550000 }, { itemId: toll.id, actualAmount: 250000 }] });
    await upload(ops, 'CASH_ADVANCE_ITEM', fuel.id, 'RECEIPT');
    await upload(ops, 'CASH_ADVANCE_ITEM', toll.id, 'PHOTO');
    // biaya di luar rencana wajib bukti juga
    const withExtra = await report.addExtraCost(ops, ca.id, { workOrderItemId: w.itemId, chargeTypeId: ct.MEALS, description: 'Makan supir', amount: 20000, billable: true });
    await rejectsWith(report.submit(ops, ca.id), ConflictException, 'belum lengkap');
    await upload(ops, 'CASH_ADVANCE_EXTRA_COST', withExtra.extraCosts[0].id, 'RECEIPT');

    await report.submit(ops, ca.id);
    expect(await status(ca.id)).toBe('REPORT_SUBMITTED');
    await rejectsWith(report.approve(director, ca.id), ConflictException, 'diperiksa');
    await report.check(checker, ca.id);
    await report.approve(director, ca.id);
    expect(await status(ca.id)).toBe('REPORT_APPROVED');

    // tagihan AT_COST = realisasi; tarif FIXED (trucking) tidak berubah
    expect(num((await billable(w.itemId, 'FUEL'))!.totalPrice)).toBe(550000);
    expect(num((await billable(w.itemId, 'TOLL'))!.totalPrice)).toBe(250000);
    expect(num((await billable(w.itemId, 'MEALS'))!.totalPrice)).toBe(20000);
    expect(num((await billable(w.itemId, 'TRUCKING'))!.totalPrice)).toBe(2000000);

    // selisih = 850000 - 800000 - 20000 = 30000 -> sisa, dikembalikan staf
    const s = (await advances.findOne(ca.id)).settlement;
    expect(num(s.balance)).toBe(30000);
    expect(s.direction).toBe('RETURN_TO_COMPANY');

    await rejectsWith(returns.create(ops, { returnDate: dateOf(), returnedBy: 'Andi', items: [{ cashAdvanceId: ca.id, amount: 40000 }] }), ConflictException, 'melebihi');
    const ret = await returns.create(ops, { returnDate: dateOf(), returnedBy: 'Andi', items: [{ cashAdvanceId: ca.id, amount: 30000 }] });
    expect(ret.number).toMatch(/^RT\/2611\/\d{4}$/);
    expect(ret.direction).toBe('RETURN_TO_COMPANY');
    await rejectsWith(returns.receive(finance, ret.id), ConflictException, 'Bukti transfer belum diunggah');
    await upload(ops, 'ADVANCE_RETURN', ret.id, 'TRANSFER_PROOF');
    await rejectsWith(returns.receive(as(ops, ALL), ret.id), ForbiddenException, 'pemisahan tugas');
    await returns.receive(finance, ret.id);
    expect(await status(ca.id)).toBe('SETTLED');

    const hist = await prisma.approvalHistory.findMany({ where: { docType: 'CASH_ADVANCE', docId: ca.id }, orderBy: { actedAt: 'asc' } });
    expect(hist.map((h) => h.step)).toEqual(['CHECK', 'APPROVE', 'PAY', 'VERIFY_TRANSFER', 'REPORT_SUBMIT', 'REPORT_CHECK', 'REPORT_APPROVE', 'RECEIVE']);
  });
});

describe('Kekurangan dana dan selisih nol', () => {
  it('kekurangan: perusahaan mengganti, dikonfirmasi Checker', async () => {
    const w = await makeWo({ LOLO: 350000 });
    const ca = await createCB(w.woId, [[w.pc.LOLO, 350000]]);
    expect(ca.number).toMatch(/^CB\/2611\/\d{4}$/);
    await driveToReportOpen(ca.id);
    await fillAndSubmit(ca.id, [400000]);
    await report.check(checker, ca.id);
    await report.approve(director, ca.id);
    const s = (await advances.findOne(ca.id)).settlement;
    expect(num(s.balance)).toBe(-50000);
    expect(s.direction).toBe('REIMBURSE_STAFF');
    expect(num((await billable(w.itemId, 'LOLO'))!.totalPrice)).toBe(400000);

    // pembuat arah penggantian = Keuangan; operasional tidak berhak membuatnya
    await rejectsWith(returns.create(ops, { returnDate: dateOf(), returnedBy: 'Andi', items: [{ cashAdvanceId: ca.id, amount: 50000 }] }), ForbiddenException);
    const ret = await returns.create(finance, { returnDate: dateOf(), returnedBy: 'Andi', items: [{ cashAdvanceId: ca.id, amount: 50000 }] });
    expect(ret.direction).toBe('REIMBURSE_STAFF');
    await upload(finance, 'ADVANCE_RETURN', ret.id, 'TRANSFER_PROOF');
    await rejectsWith(returns.receive(finance, ret.id), ForbiddenException);
    await returns.receive(checker, ret.id);
    expect(await status(ca.id)).toBe('SETTLED');
  });

  it('selisih nol: langsung SETTLED saat LPJ disetujui, tanpa pengembalian; tarif FIXED tidak disentuh', async () => {
    const w = await makeWo({ HANDLING: 150000 });
    await prisma.billableCharge.create({ data: { workOrderItemId: w.itemId, chargeTypeId: ct.HANDLING, quantity: 1, unitPrice: 250000, totalPrice: 250000 } });
    const ca = await createCB(w.woId, [[w.pc.HANDLING, 150000]]);
    await driveToReportOpen(ca.id);
    await fillAndSubmit(ca.id, [150000]);
    await report.check(checker, ca.id);
    await report.approve(director, ca.id);
    expect(await status(ca.id)).toBe('SETTLED');
    expect(num((await billable(w.itemId, 'HANDLING'))!.totalPrice)).toBe(250000);
  });
});

describe('Aturan pengajuan', () => {
  it('batas kumulatif biaya rencana, dan bearer', async () => {
    const w = await makeWo({ LOLO: 350000, FUEL: { amount: 600000, bearer: 'VENDOR' }, TOLL: { amount: 250000, bearer: 'DEDUCT_FROM_VENDOR' } });
    const a = await createCB(w.woId, [[w.pc.LOLO, 200000]]);
    await rejectsWith(createCB(w.woId, [[w.pc.LOLO, 200000]]), ConflictException, 'Sisa yang dapat diajukan: 150000.00');
    await createCB(w.woId, [[w.pc.LOLO, 150000]]); // pas sampai batas
    await advances.cancel(ops, a.id, 'salah input');
    await createCB(w.woId, [[w.pc.LOLO, 200000]]); // pengajuan batal tidak dihitung
    await rejectsWith(createUJ(w.woId, [[w.pc.FUEL, 100000]]), ConflictException, 'ditanggung vendor');
    const t = await createUJ(w.woId, [[w.pc.TOLL, 250000]]); // ditalangi lalu dipotong: boleh
    expect(t.items[0].plannedCost.bearer).toBe('DEDUCT_FROM_VENDOR');
    await rejectsWith(createUJ(w.woId, [[w.pc.TOLL, 1000]]), ConflictException, 'melebihi biaya rencana'); // batas habis

    const w3 = await makeWo({ FUEL: 600000 });
    await createUJ(w3.woId, [[w3.pc.FUEL, 300000]]);
    await rejectsWith(createUJ(w3.woId, [[w3.pc.FUEL, 100000]]), ConflictException, 'uang jalan aktif'); // sisa batas ada, tetapi satu item satu uang jalan
  });

  it('tipe pengajuan harus sesuai kategori biaya; WO harus COST_APPROVED', async () => {
    const w = await makeWo({ FUEL: 100000, LOLO: 100000 });
    await rejectsWith(createCB(w.woId, [[w.pc.FUEL, 1000]]), Error, 'komponen uang jalan');
    await rejectsWith(createUJ(w.woId, [[w.pc.LOLO, 1000]]), Error, 'bukan komponen uang jalan');
    const open = await makeWo({ LOLO: 100000 }, 'OPEN');
    await rejectsWith(createCB(open.woId, [[open.pc.LOLO, 1000]]), ConflictException, 'disetujui');
  });

  it('dua pengajuan bersamaan tidak bisa sama-sama melewati batas; nomor tidak bentrok', async () => {
    const w = await makeWo({ LOLO: 350000 });
    const r = await Promise.allSettled([createCB(w.woId, [[w.pc.LOLO, 200000]], ops), createCB(w.woId, [[w.pc.LOLO, 200000]], ops2)]);
    expect(r.filter((x) => x.status === 'fulfilled').length).toBe(1);
    expect(r.filter((x) => x.status === 'rejected').length).toBe(1);

    const many = await Promise.all(Array.from({ length: 5 }, async () => {
      const x = await makeWo({ HANDLING: 1000 });
      return createCB(x.woId, [[x.pc.HANDLING, 1000]]);
    }));
    expect(new Set(many.map((m) => m.number)).size).toBe(5);
  });
});

describe('Pemisahan tugas', () => {
  it('setiap langkah menolak orang yang sama dengan pelaku langkah terkait', async () => {
    const w = await makeWo({ FUEL: 600000 });
    const ca = await createUJ(w.woId, [[w.pc.FUEL, 600000]]);
    await rejectsWith(advances.check(as(ops, ALL), ca.id), ForbiddenException, 'pembuat pengajuan');
    await advances.check(checker, ca.id);
    await rejectsWith(advances.approve(as(checker, ALL), ca.id), ForbiddenException, 'pemeriksa pengajuan');
    await advances.approve(director, ca.id);
    await upload(finance, 'CASH_ADVANCE', ca.id, 'TRANSFER_PROOF');
    await rejectsWith(advances.pay(as(director, ALL), ca.id, { cashAccountId: await accId() }), ForbiddenException, 'penyetuju pengajuan');
    await advances.pay(finance, ca.id, { cashAccountId: await accId() });
    await rejectsWith(advances.verifyTransfer(as(finance, ALL), ca.id), ForbiddenException, 'pembayar dana');
    await advances.verifyTransfer(checker, ca.id);

    // hanya pemegang dana yang mengisi LPJ
    await rejectsWith(report.saveActuals(ops2, ca.id, { items: [{ itemId: ca.items[0].id, actualAmount: 1 }] }), ForbiddenException, 'pemegang dana');
    await rejectsWith(upload(ops2, 'CASH_ADVANCE_ITEM', ca.items[0].id, 'RECEIPT'), ForbiddenException, 'pemegang dana');
    await fillAndSubmit(ca.id, [600000]);
    await rejectsWith(report.check(as(ops, ALL), ca.id), ForbiddenException, 'pemisahan tugas');
    await report.check(checker, ca.id);
    await rejectsWith(report.approve(as(checker, ALL), ca.id), ForbiddenException, 'pemeriksa LPJ');
    await report.approve(director, ca.id);
    expect(await status(ca.id)).toBe('SETTLED');
  });

  it('persetujuan bersamaan: hanya satu yang berhasil', async () => {
    const w = await makeWo({ LOLO: 100000 });
    const ca = await createCB(w.woId, [[w.pc.LOLO, 100000]]);
    await advances.check(checker, ca.id);
    const r = await Promise.allSettled([advances.approve(director, ca.id), advances.approve(director2, ca.id)]);
    expect(r.filter((x) => x.status === 'fulfilled').length).toBe(1);
    expect((await prisma.approvalHistory.count({ where: { docId: ca.id, step: 'APPROVE' } }))).toBe(1);
  });
});

describe('LPJ dikembalikan, tolak, batal', () => {
  it('checker mengembalikan LPJ untuk diperbaiki, lalu diajukan ulang', async () => {
    const w = await makeWo({ LOLO: 100000 });
    const ca = await createCB(w.woId, [[w.pc.LOLO, 100000]]);
    await driveToReportOpen(ca.id);
    await fillAndSubmit(ca.id, [90000]);
    await report.returnReport(checker, ca.id, 'Bon kurang jelas');
    expect(await status(ca.id)).toBe('TRANSFER_VERIFIED');
    await report.saveActuals(ops, ca.id, { items: [{ itemId: ca.items[0].id, actualAmount: 95000 }] });
    await report.submit(ops, ca.id);
    await report.check(checker, ca.id);
    await report.returnReport(director, ca.id, 'Angka belum cocok');
    expect(await status(ca.id)).toBe('TRANSFER_VERIFIED');
    const h = await prisma.approvalHistory.findMany({ where: { docId: ca.id, action: 'REJECT' }, orderBy: { actedAt: 'asc' } });
    expect(h.map((x) => x.note)).toEqual(['Bon kurang jelas', 'Angka belum cocok']);
  });

  it('tolak mengakhiri dokumen; batal hanya sebelum dana cair dan hanya oleh pembuat', async () => {
    const w = await makeWo({ LOLO: 100000 });
    const a = await createCB(w.woId, [[w.pc.LOLO, 50000]]);
    await advances.reject(checker, a.id, 'Tidak sesuai');
    expect(await status(a.id)).toBe('REJECTED');
    await rejectsWith(advances.check(checker, a.id), ConflictException);
    const b = await createCB(w.woId, [[w.pc.LOLO, 50000]]); // tolakan tidak menghabiskan batas
    await rejectsWith(advances.cancel(ops2, b.id, 'iseng'), ForbiddenException);
    await advances.cancel(ops, b.id, 'tidak jadi');
    expect(await status(b.id)).toBe('CANCELLED');
    const c = await createCB(w.woId, [[w.pc.LOLO, 50000]]);
    await driveToReportOpen(c.id);
    await rejectsWith(advances.cancel(ops, c.id, 'terlambat'), ConflictException);
  });
});

describe('Penagihan', () => {
  it('menjumlahkan beberapa cashbon untuk satu biaya; tarif yang sudah masuk invoice tidak diubah diam-diam', async () => {
    const w = await makeWo({ LOLO: 350000 });
    for (const [amt, act] of [[200000, 200000], [150000, 150000]] as const) {
      const ca = await createCB(w.woId, [[w.pc.LOLO, amt]]);
      await driveToReportOpen(ca.id);
      await fillAndSubmit(ca.id, [act]);
      await report.check(checker, ca.id);
      await report.approve(director, ca.id);
    }
    expect(num((await billable(w.itemId, 'LOLO'))!.totalPrice)).toBe(350000);

    const w2 = await makeWo({ LOLO: 100000 });
    await prisma.billableCharge.create({ data: { workOrderItemId: w2.itemId, chargeTypeId: ct.LOLO, quantity: 1, unitPrice: 111, totalPrice: 111, invoiceId: '01a1a03e-f635-751e-ab45-5f3d43a0a98f' } });
    const ca2 = await createCB(w2.woId, [[w2.pc.LOLO, 100000]]);
    await driveToReportOpen(ca2.id);
    await fillAndSubmit(ca2.id, [100000]);
    await report.check(checker, ca2.id);
    await rejectsWith(report.approve(director, ca2.id), ConflictException, 'sudah masuk invoice');
    expect(await status(ca2.id)).toBe('REPORT_CHECKED'); // transaksi dibatalkan utuh, status tetap
    expect(await prisma.approvalHistory.count({ where: { docId: ca2.id, step: 'REPORT_APPROVE' } })).toBe(0);
  });

  it('bearer DEDUCT_FROM_VENDOR tidak ditagihkan ke customer', async () => {
    const w = await makeWo({ TOLL: { amount: 250000, bearer: 'DEDUCT_FROM_VENDOR' } });
    const ca = await createUJ(w.woId, [[w.pc.TOLL, 250000]]);
    await driveToReportOpen(ca.id);
    await fillAndSubmit(ca.id, [250000]);
    await report.check(checker, ca.id);
    await report.approve(director, ca.id);
    expect(await billable(w.itemId, 'TOLL')).toBeNull();
  });
});

describe('Pengaturan alur persetujuan', () => {
  const set = (step: any, dto: any) => workflow.update(director, 'CASH_ADVANCE', step, dto);
  it('langkah dapat dinonaktifkan; dokumen berjalan tidak terpengaruh; ada jejak perubahan', async () => {
    await set('CHECK', { isEnabled: false });
    try {
      const w = await makeWo({ LOLO: 100000 });
      const ca = await createCB(w.woId, [[w.pc.LOLO, 100000]]);
      expect(ca.requiredSteps).not.toContain('CHECK');
      await rejectsWith(advances.check(checker, ca.id), ConflictException, 'tidak berlaku');
      await advances.approve(director, ca.id); // langsung dari DRAFT
      expect(await status(ca.id)).toBe('APPROVED');
    } finally { await set('CHECK', { isEnabled: true }); }

    // dibekukan saat keluar dari DRAFT: dicek dulu, lalu pengaturan dimatikan -> tetap lewat alur CHECKED
    const w2 = await makeWo({ LOLO: 100000 });
    const ca2 = await createCB(w2.woId, [[w2.pc.LOLO, 100000]]);
    await advances.check(checker, ca2.id);
    await set('CHECK', { isEnabled: false });
    try {
      await advances.approve(director, ca2.id);
      expect((await advances.findOne(ca2.id)).requiredSteps).toContain('CHECK');
    } finally { await set('CHECK', { isEnabled: true }); }
    expect(await prisma.workflowSettingLog.count()).toBeGreaterThanOrEqual(4);
  });

  it('batas nominal: verifikasi transfer hanya berlaku untuk pengajuan besar', async () => {
    await set('VERIFY_TRANSFER', { minAmount: 1_000_000 });
    try {
      const w = await makeWo({ LOLO: 500000 });
      const ca = await createCB(w.woId, [[w.pc.LOLO, 500000]]);
      expect(ca.requiredSteps).not.toContain('VERIFY_TRANSFER');
      await advances.check(checker, ca.id);
      await advances.approve(director, ca.id);
      await upload(finance, 'CASH_ADVANCE', ca.id, 'TRANSFER_PROOF');
      await advances.pay(finance, ca.id, { cashAccountId: await accId() });
      await rejectsWith(advances.verifyTransfer(checker, ca.id), ConflictException, 'tidak berlaku');
      await report.saveActuals(ops, ca.id, { items: [{ itemId: ca.items[0].id, actualAmount: 500000 }] }); // LPJ terbuka langsung dari PAID
    } finally { await set('VERIFY_TRANSFER', { minAmount: 0 }); }
  });

  it('langkah inti tidak dapat diatur', async () => {
    await rejectsWith(workflow.update(director, 'CASH_ADVANCE', 'PAY', { isEnabled: false }), Error, 'tidak dapat diatur');
  });
});

describe('Lampiran', () => {
  it('menolak isi file yang tidak cocok dengan jenisnya, dan unggahan oleh pihak yang salah', async () => {
    const w = await makeWo({ LOLO: 100000 });
    const ca = await createCB(w.woId, [[w.pc.LOLO, 100000]]);
    const fake = { originalname: 'x.png', mimetype: 'image/png', size: 5, buffer: Buffer.from('bukan gambar') };
    await advances.check(checker, ca.id); await advances.approve(director, ca.id);
    await rejectsWith(attachments.upload(finance, { ownerType: 'CASH_ADVANCE', ownerId: ca.id, kind: 'TRANSFER_PROOF' }, fake), Error, 'JPG, PNG');
    await rejectsWith(upload(ops, 'CASH_ADVANCE', ca.id, 'TRANSFER_PROOF'), ForbiddenException);      // bukan Keuangan
    await rejectsWith(upload(ops, 'CASH_ADVANCE_ITEM', ca.items[0].id, 'RECEIPT'), ConflictException); // LPJ belum terbuka
    const ok = await upload(finance, 'CASH_ADVANCE', ca.id, 'TRANSFER_PROOF');
    const f = await attachments.open(ok.id);
    expect(f.mimeType).toBe('image/png');
    await attachments.remove(finance, ok.id);
    expect(await prisma.attachment.count({ where: { ownerId: ca.id } })).toBe(0);
  });
});
