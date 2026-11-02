// Seed data awal. Aman dijalankan berulang (memakai upsert / skipDuplicates).
// Jalankan: npx prisma db seed
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  PERMISSIONS as P,
  PERMISSION_LIST,
} from '../src/common/constants/permission.constant.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Pakai || (bukan ??) agar nilai kosong di .env tetap jatuh ke default.
const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'password123';
// Set SEED_RESET_PASSWORDS=true untuk menimpa password user demo yang sudah ada.
const RESET_PASSWORDS = process.env.SEED_RESET_PASSWORDS === 'true';

const codes = (...list: { code: string }[]) => list.map((p) => p.code);

// ---------------------------------------------------------------
// Role dan isi permission (USULAN AWAL; bisa diubah dari UI admin)
// ---------------------------------------------------------------
const ROLES = [
  {
    code: 'SUPER_ADMIN',
    name: 'Super Admin',
    isSystem: true,
    description: 'Akses penuh, tidak bisa dihapus',
    permissions: PERMISSION_LIST.map((p) => p.code),
  },
  {
    code: 'COMMISSIONER',
    name: 'Komisaris',
    description: 'Melihat dashboard dan laporan',
    permissions: codes(
      P.DASHBOARD_VIEW,
      P.WORK_ORDER_VIEW,
      P.CASH_ADVANCE_VIEW,
      P.PROFIT_VIEW,
    ),
  },
  {
    code: 'DIRECTOR',
    name: 'Direktur',
    description: 'Melihat semua dan menyetujui',
    permissions: codes(
      P.DASHBOARD_VIEW,
      P.WORK_ORDER_VIEW,
      P.WORK_ORDER_COST_APPROVE,
      P.CASH_ADVANCE_VIEW,
      P.CASH_ADVANCE_APPROVE,
      P.CASH_ADVANCE_APPROVE_REPORT,
      P.PROFIT_VIEW,
      P.CHARGE_VIEW_HIDDEN,
    ),
  },
  {
    code: 'HRD',
    name: 'HRD',
    description: 'Mengelola user dan role',
    permissions: codes(P.DASHBOARD_VIEW, P.USER_MANAGE, P.ROLE_MANAGE),
  },
  {
    code: 'OPERATIONS',
    name: 'Operasional',
    description: 'Membuat WO, biaya rencana, mengajukan dana, membuat LPJ',
    permissions: codes(
      P.DASHBOARD_VIEW,
      P.WORK_ORDER_VIEW,
      P.WORK_ORDER_CREATE,
      P.WORK_ORDER_UPDATE,
      P.PLANNED_COST_MANAGE,
      P.CASH_ADVANCE_VIEW,
      P.CASH_ADVANCE_CREATE,
      P.CASH_ADVANCE_SUBMIT_REPORT,
      P.ADVANCE_RETURN_CREATE,
    ),
  },
  {
    code: 'CHECKER',
    name: 'Checker',
    description: 'Mengecek biaya ops, pengajuan dana, dan LPJ',
    permissions: codes(
      P.DASHBOARD_VIEW,
      P.WORK_ORDER_VIEW,
      P.WORK_ORDER_COST_CHECK,
      P.CASH_ADVANCE_VIEW,
      P.CASH_ADVANCE_CHECK,
    ),
  },
  {
    code: 'FINANCE',
    name: 'Keuangan',
    description: 'Mencairkan dana dan menerima pengembalian',
    permissions: codes(
      P.DASHBOARD_VIEW,
      P.WORK_ORDER_VIEW,
      P.CASH_ADVANCE_VIEW,
      P.CASH_ADVANCE_PAY,
      P.ADVANCE_RETURN_RECEIVE,
    ),
  },
];

// ---------------------------------------------------------------
// User demo (satu per role) untuk skenario presentasi
// ---------------------------------------------------------------
const USERS = [
  { username: 'admin', fullName: 'Admin Sistem', role: 'SUPER_ADMIN' },
  { username: 'komisaris', fullName: 'Budi Komisaris', role: 'COMMISSIONER' },
  { username: 'direktur', fullName: 'Sari Direktur', role: 'DIRECTOR' },
  { username: 'hrd', fullName: 'Dewi HRD', role: 'HRD' },
  { username: 'operasional', fullName: 'Andi Operasional', role: 'OPERATIONS' },
  { username: 'checker', fullName: 'Rina Checker', role: 'CHECKER' },
  { username: 'keuangan', fullName: 'Tono Keuangan', role: 'FINANCE' },
];

// ---------------------------------------------------------------
// Jenis biaya (ilustrasi; sesuaikan dengan data sebenarnya)
// ---------------------------------------------------------------
const CHARGE_TYPES = [
  // Komponen uang jalan: biaya dihitung dari realisasi LPJ
  { code: 'FUEL', name: 'BBM', category: 'UANG_JALAN', useActualCost: true, sortOrder: 1 },
  { code: 'TOLL', name: 'Tol', category: 'UANG_JALAN', useActualCost: true, sortOrder: 2 },
  { code: 'LEVY', name: 'Retribusi', category: 'UANG_JALAN', useActualCost: true, sortOrder: 3 },
  { code: 'MEALS', name: 'Konsumsi', category: 'UANG_JALAN', useActualCost: true, sortOrder: 4 },
  // Biaya dan tarif umum
  { code: 'TRUCKING', name: 'Trucking', category: 'TRUCKING', isTrucking: true, sortOrder: 10 },
  { code: 'LOLO', name: 'Lift On/Lift Off', category: 'LOLO', useActualCost: true, sortOrder: 11 },
  { code: 'HANDLING', name: 'Handling', category: 'HANDLING', sortOrder: 12 },
];

async function main() {
  // 1. Permission
  for (const p of PERMISSION_LIST) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module, description: p.description },
      create: { code: p.code, module: p.module, description: p.description },
    });
  }
  const permissions = await prisma.permission.findMany();
  const permId = new Map(permissions.map((p) => [p.code, p.id]));

  // 2. Role + isi permission (hanya menambah, tidak menghapus perubahan admin)
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description },
      create: {
        code: r.code,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem ?? false,
      },
    });
    await prisma.rolePermission.createMany({
      data: r.permissions.map((c) => ({
        roleId: role.id,
        permissionId: permId.get(c)!,
      })),
      skipDuplicates: true,
    });
  }

  // 3. User demo
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: { fullName: u.fullName, ...(RESET_PASSWORDS ? { passwordHash } : {}) },
      create: { username: u.username, fullName: u.fullName, passwordHash },
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { code: u.role } });
    await prisma.userRole.createMany({
      data: [{ userId: user.id, roleId: role.id }],
      skipDuplicates: true,
    });
  }

  // 4. Data master
  for (const c of CHARGE_TYPES) {
    await prisma.chargeType.upsert({
      where: { code: c.code },
      update: {},
      create: c,
    });
  }
  for (const a of [
    { code: 'KAS', name: 'Kas Besar' },
    { code: 'BANK', name: 'Bank Operasional' },
  ]) {
    await prisma.cashAccount.upsert({ where: { code: a.code }, update: {}, create: a });
  }
  const customers = await Promise.all(
    [
      { code: 'CUST-A', name: 'PT Contoh Satu', paymentTermsDays: 30 },
      { code: 'CUST-B', name: 'PT Contoh Dua', paymentTermsDays: 14 },
      { code: 'CUST-C', name: 'PT Contoh Tiga', paymentTermsDays: 0 },
    ].map((c) =>
      prisma.customer.upsert({ where: { code: c.code }, update: {}, create: c }),
    ),
  );
  const vehicles = await Promise.all(
    [
      { plateNo: 'B 1001 AGS', ownerCode: 'AGS', isInternal: true },
      { plateNo: 'B 1002 AGS', ownerCode: 'AGS', isInternal: true },
      { plateNo: 'B 9001 VND', ownerCode: 'VENDOR1', isInternal: false },
    ].map((v) =>
      prisma.vehicle.upsert({ where: { plateNo: v.plateNo }, update: {}, create: v }),
    ),
  );
  const drivers = await Promise.all(
    [
      { code: 'DRV-01', name: 'Supir Satu' },
      { code: 'DRV-02', name: 'Supir Dua' },
    ].map((d) =>
      prisma.driver.upsert({ where: { code: d.code }, update: {}, create: d }),
    ),
  );

  // 5. Work Order contoh untuk demo
  const ops = await prisma.user.findUniqueOrThrow({ where: { username: 'operasional' } });
  const ct = Object.fromEntries(
    (await prisma.chargeType.findMany()).map((c) => [c.code, c.id]),
  );

  const wo = await prisma.workOrder.upsert({
    where: { number: 'WO-DEMO-001' },
    update: {},
    create: {
      number: 'WO-DEMO-001',
      orderDate: new Date(),
      customerId: customers[0].id,
      project: 'Demo Direksi',
      createdById: ops.id,
    },
  });

  const items = [
    {
      lineNo: 1,
      containerNo: 'DEMO1234567',
      containerSize: '20',
      vehicleId: vehicles[0].id,
      driverId: drivers[0].id,
      origin: 'Pelabuhan Tanjung Priok',
      destination: 'Cikarang',
      costs: { FUEL: 600000, TOLL: 250000, LEVY: 50000, MEALS: 100000, LOLO: 350000, HANDLING: 150000 },
      prices: { TRUCKING: 2000000, LOLO: 500000, HANDLING: 250000 },
    },
    {
      lineNo: 2,
      containerNo: 'DEMO7654321',
      containerSize: '40',
      vehicleId: vehicles[1].id,
      driverId: drivers[1].id,
      origin: 'Pelabuhan Tanjung Priok',
      destination: 'Karawang',
      costs: { FUEL: 800000, TOLL: 300000, LEVY: 70000, MEALS: 100000, LOLO: 450000, HANDLING: 200000 },
      prices: { TRUCKING: 2800000, LOLO: 650000, HANDLING: 300000 },
    },
  ];

  for (const it of items) {
    const item = await prisma.workOrderItem.upsert({
      where: { workOrderId_lineNo: { workOrderId: wo.id, lineNo: it.lineNo } },
      update: {},
      create: {
        workOrderId: wo.id,
        lineNo: it.lineNo,
        direction: 'EXPORT',
        loadType: 'FCL',
        containerNo: it.containerNo,
        containerSize: it.containerSize,
        vehicleId: it.vehicleId,
        driverId: it.driverId,
        origin: it.origin,
        destination: it.destination,
        status: 'ACTIVE',
      },
    });

    for (const [code, amount] of Object.entries(it.costs)) {
      await prisma.plannedCost.upsert({
        where: {
          workOrderItemId_chargeTypeId: {
            workOrderItemId: item.id,
            chargeTypeId: ct[code],
          },
        },
        update: {},
        create: {
          workOrderItemId: item.id,
          chargeTypeId: ct[code],
          quantity: 1,
          unitCost: amount,
          totalCost: amount,
          createdById: ops.id,
        },
      });
    }
    for (const [code, amount] of Object.entries(it.prices)) {
      await prisma.billableCharge.upsert({
        where: {
          workOrderItemId_chargeTypeId: {
            workOrderItemId: item.id,
            chargeTypeId: ct[code],
          },
        },
        update: {},
        create: {
          workOrderItemId: item.id,
          chargeTypeId: ct[code],
          quantity: 1,
          unitPrice: amount,
          totalPrice: amount,
        },
      });
    }
  }

  console.log('Seed selesai.');
  console.log(`Login demo: username (admin, direktur, operasional, ...) / password "${DEMO_PASSWORD}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());