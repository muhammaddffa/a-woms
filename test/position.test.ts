import 'reflect-metadata';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ContainerPositionService } from '../src/container-position/container-position.service.js';
import { WorkOrderItemService } from '../src/work-order-item/work-order-item.service.js';
import { setPositionSchema } from '../src/container-position/dto/container-position.dto.js';
import {
  createWorkOrderItemSchema,
  updateWorkOrderItemSchema,
} from '../src/work-order-item/dto/work-order-item.dto.js';

const prisma = new PrismaService();
const svc = new ContainerPositionService(prisma);
const items = new WorkOrderItemService(prisma);
let pass = 0,
  fail = 0;
const ok = (c: boolean, m: string) => {
  c ? pass++ : (fail++, console.log('GAGAL:', m));
};
const status = async (p: Promise<unknown>) => {
  try {
    await p;
    return 200;
  } catch (e: any) {
    return e.getStatus?.() ?? `ERR ${e.message}`;
  }
};

async function main() {
  const user = await prisma.user.create({
    data: { username: 'ops', fullName: 'Andi Operasional', passwordHash: 'x' },
  });
  const actor = { id: user.id, username: 'ops', permissions: [] };
  const cust = await prisma.customer.create({
    data: { code: 'C1', name: 'Cust' },
  });
  const wo = await prisma.workOrder.create({
    data: { number: 'WO1', orderDate: new Date(), customerId: cust.id },
  });
  const wo2 = await prisma.workOrder.create({
    data: { number: 'WO2', orderDate: new Date(), customerId: cust.id },
  });
  const mk = (w: string, n: number) =>
    prisma.workOrderItem.create({
      data: { workOrderId: w, lineNo: n, status: 'ACTIVE' },
    });
  const [i1, i2, i3] = [
    await mk(wo.id, 1),
    await mk(wo.id, 2),
    await mk(wo.id, 3),
  ];
  const other = await mk(wo2.id, 1);
  const P: Record<string, string> = {};
  for (const [n, [code, name, active]] of Object.entries([
    ['AT_DEPOT', 'di depo', true],
    ['STUFFED', 'sudah stuffing', true],
    ['IN_CUSTODY', 'dititipkan', true],
    ['TO_FACTORY', 'menuju pabrik', true],
    ['OLD', 'lama', false],
  ] as const)) {
    P[code] = (
      await prisma.containerPosition.create({
        data: { code, name, sortOrder: Number(n), isActive: active },
      })
    ).id;
  }

  // 1. daftar posisi hanya yang aktif dan berurut
  const list = await svc.listPositions();
  ok(
    list.data.length === 4 && list.data[0].code === 'AT_DEPOT',
    'daftar posisi aktif',
  );

  // 2. set posisi pertama, termasuk respons item
  const r1: any = await svc.setPosition(actor, wo.id, i1.id, {
    positionId: P.AT_DEPOT,
  });
  ok(
    r1.currentPosition?.code === 'AT_DEPOT' && r1.positionUpdatedAt,
    'posisi pertama tersimpan',
  );

  // 3. lompat tidak berurutan + catatan
  await svc.setPosition(actor, wo.id, i1.id, { positionId: P.STUFFED });
  const r3: any = await svc.setPosition(
    actor,
    wo.id,
    i1.id,
    setPositionSchema.parse({
      positionId: P.IN_CUSTODY,
      note: ' Penitipan X ',
    }),
  );
  ok(
    r3.currentPosition.code === 'IN_CUSTODY' &&
      r3.positionNote === 'Penitipan X',
    'catatan di-trim dan tersimpan',
  );
  const r3b: any = await svc.setPosition(actor, wo.id, i1.id, {
    positionId: P.TO_FACTORY,
  });
  ok(
    r3b.currentPosition.code === 'TO_FACTORY' && r3b.positionNote === null,
    'kembali ke posisi sebelumnya boleh, catatan dikosongkan',
  );

  // 4. sama persis ditolak
  ok(
    (await status(
      svc.setPosition(actor, wo.id, i1.id, { positionId: P.TO_FACTORY }),
    )) === 409,
    'posisi sama ditolak 409',
  );
  ok(
    (await status(
      svc.setPosition(actor, wo.id, i1.id, {
        positionId: P.TO_FACTORY,
        note: '   '.trim(),
      }),
    )) === 409,
    'catatan kosong dianggap sama',
  );
  ok(
    (await status(
      svc.setPosition(actor, wo.id, i1.id, {
        positionId: P.TO_FACTORY,
        note: 'sopir sudah jalan',
      }),
    )) === 200,
    'posisi sama tapi catatan beda diterima',
  );

  // 5. posisi tidak aktif / tidak ada
  ok(
    (await status(
      svc.setPosition(actor, wo.id, i2.id, { positionId: P.OLD }),
    )) === 400,
    'posisi nonaktif 400',
  );
  ok(
    (await status(
      svc.setPosition(actor, wo.id, i2.id, {
        positionId: '01a1a530-06aa-711c-af24-1a549523ccaa',
      }),
    )) === 400,
    'posisi tidak ada 400',
  );

  // 6. item milik WO lain -> 404
  ok(
    (await status(
      svc.setPosition(actor, wo.id, other.id, { positionId: P.AT_DEPOT }),
    )) === 404,
    'item WO lain 404',
  );

  // 7. WO status biaya tidak menghalangi
  await prisma.workOrder.update({
    where: { id: wo.id },
    data: { status: 'COST_APPROVED' },
  });
  ok(
    (await status(
      svc.setPosition(actor, wo.id, i2.id, { positionId: P.AT_DEPOT }),
    )) === 200,
    'WO COST_APPROVED tetap boleh',
  );

  // 8. item batal, WO batal/tutup
  await prisma.workOrderItem.update({
    where: { id: i3.id },
    data: { status: 'CANCELLED' },
  });
  ok(
    (await status(
      svc.setPosition(actor, wo.id, i3.id, { positionId: P.AT_DEPOT }),
    )) === 409,
    'item CANCELLED 409',
  );
  for (const s of ['CLOSED', 'CANCELLED'] as const) {
    await prisma.workOrder.update({
      where: { id: wo.id },
      data: { status: s },
    });
    ok(
      (await status(
        svc.setPosition(actor, wo.id, i2.id, { positionId: P.STUFFED }),
      )) === 409,
      `WO ${s} 409`,
    );
  }
  await prisma.workOrder.update({
    where: { id: wo.id },
    data: { status: 'OPEN' },
  });

  // 9. riwayat
  const h = await svc.history(wo.id, i1.id);
  ok(
    h.length === 5 &&
      h[0].note === 'sopir sudah jalan' &&
      h[0].actor.fullName === 'Andi Operasional' &&
      h[h.length - 1].position.code === 'AT_DEPOT',
    'riwayat 5 entri, terbaru dulu',
  );
  ok(
    (await status(svc.history(wo.id, other.id))) === 404,
    'riwayat item WO lain 404',
  );
  ok(
    (await prisma.containerPositionLog.count({
      where: { workOrderItemId: i3.id },
    })) === 0,
    'penolakan tidak meninggalkan log',
  );

  // 10. dua permintaan bersamaan: keduanya tercatat, status akhir salah satunya
  const before = await prisma.containerPositionLog.count({
    where: { workOrderItemId: i2.id },
  });
  await Promise.all([
    svc.setPosition(actor, wo.id, i2.id, { positionId: P.STUFFED }),
    svc.setPosition(actor, wo.id, i2.id, { positionId: P.IN_CUSTODY }),
  ]);
  const after = await prisma.containerPositionLog.count({
    where: { workOrderItemId: i2.id },
  });
  const cur = await prisma.workOrderItem.findUniqueOrThrow({
    where: { id: i2.id },
    select: { currentPositionId: true },
  });
  ok(
    after - before === 2 &&
      [P.STUFFED, P.IN_CUSTODY].includes(cur.currentPositionId!),
    'dua permintaan bersamaan tercatat semua',
  );

  // 11. field kontainer baru lewat service item
  const u: any = await items.update(wo.id, i1.id, {
    tare: 3700,
    actualContainerSize: '40 HC',
    stuffingLocation: 'Gudang X',
    containerNo: 'cmau8865448',
  });
  ok(
    Number(u.tare) === 3700 &&
      u.actualContainerSize === '40 HC' &&
      u.stuffingLocation === 'Gudang X',
    'field baru tersimpan dan ikut di select',
  );
  ok(
    u.currentPosition?.code === 'TO_FACTORY',
    'update item tidak menghapus posisi',
  );
  const u2: any = await items.update(wo.id, i1.id, {
    tare: null,
    stuffingLocation: null,
  });
  ok(
    u2.tare === null &&
      u2.stuffingLocation === null &&
      u2.actualContainerSize === '40 HC',
    'field baru bisa dikosongkan, field lain utuh',
  );
  const c: any = await items.create(
    wo.id,
    createWorkOrderItemSchema.parse({ tare: 3750.5 }),
  );
  ok(
    Number(c.tare) === 3750.5 && c.currentPosition === null,
    'item baru: semua data kontainer opsional, posisi kosong',
  );

  // 12. validasi DTO
  ok(
    !updateWorkOrderItemSchema.safeParse({ tare: -1 }).success,
    'tare negatif ditolak',
  );
  ok(
    !updateWorkOrderItemSchema.safeParse({ tare: '3700' }).success,
    'tare string ditolak',
  );
  ok(
    updateWorkOrderItemSchema.safeParse({ tare: 3700 }).success,
    'tare angka diterima',
  );
  ok(
    !setPositionSchema.safeParse({ positionId: 'abc' }).success,
    'positionId bukan UUID ditolak',
  );
  ok(
    !setPositionSchema.safeParse({
      positionId: P.AT_DEPOT,
      note: 'x'.repeat(256),
    }).success,
    'catatan >255 ditolak',
  );
  ok(
    !(
      'currentPositionId' in
      (updateWorkOrderItemSchema.parse({
        tare: 1,
        currentPositionId: P.AT_DEPOT,
      }) as object)
    ),
    'posisi tidak bisa diubah lewat PATCH item (field dibuang)',
  );

  console.log(`\nLulus: ${pass}, gagal: ${fail}`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
