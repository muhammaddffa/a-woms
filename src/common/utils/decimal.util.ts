import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';

// Uang dan kuantitas dikirim sebagai angka JSON. Dibatasi jumlah desimalnya
// agar tidak ada kesalahan pembulatan floating point yang lolos ke database.
const hasMaxDecimals = (v: number, digits: number) => {
  const f = 10 ** digits;
  return Math.abs(Math.round(v * f) - v * f) < 1e-6;
};

export const moneySchema = z
  .number()
  .min(0, 'Tidak boleh negatif')
  .max(999_999_999_999, 'Nilai terlalu besar')
  .refine((v) => hasMaxDecimals(v, 2), 'Maksimal 2 angka desimal');

export const quantitySchema = z
  .number()
  .positive('Harus lebih dari 0')
  .max(1_000_000, 'Nilai terlalu besar')
  .refine((v) => hasMaxDecimals(v, 4), 'Maksimal 4 angka desimal');

// total = kuantitas x harga satuan, dibulatkan 2 desimal (setengah ke atas).
export const lineTotal = (
  quantity: number | string | Prisma.Decimal,
  unit: number | string | Prisma.Decimal,
): Prisma.Decimal =>
  new Prisma.Decimal(quantity).mul(unit).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export const sumDecimals = (values: (number | string | Prisma.Decimal)[]): Prisma.Decimal =>
  values.reduce<Prisma.Decimal>((acc, v) => acc.add(v), new Prisma.Decimal(0));
