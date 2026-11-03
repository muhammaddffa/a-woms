import type { Prisma } from '../../generated/prisma/client.js';

// Penomoran berurutan yang aman terhadap permintaan bersamaan:
// kunci advisory di dalam transaksi menyerialkan pembuat nomor dengan prefix yang sama,
// dan kolom unique di tabel menjadi pengaman terakhir.
//
// Pola pakai (di dalam prisma.$transaction):
//   await lockNumberSeries(tx, prefix);
//   const last = await tx.xxx.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' } });
//   const number = nextNumber(prefix, last?.number ?? null);
export async function lockNumberSeries(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS t`;
}

export function nextNumber(prefix: string, lastNumber: string | null, pad = 4): string {
  const lastSeq = lastNumber?.startsWith(prefix) ? parseInt(lastNumber.slice(prefix.length), 10) : 0;
  const seq = Number.isNaN(lastSeq) ? 0 : lastSeq;
  return `${prefix}${String(seq + 1).padStart(pad, '0')}`;
}
