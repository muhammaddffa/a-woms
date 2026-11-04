import { z } from 'zod';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Sama aturannya dengan ParseIdPipe: ID di body/query harus UUID.
export const uuidSchema = z.string().regex(UUID_PATTERN, 'ID tidak valid');

// Tanggal kalender (YYYY-MM-DD) -> Date pada 00:00 UTC, cocok dengan kolom @db.Date.
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Tanggal tidak valid')
  .transform((s) => new Date(`${s}T00:00:00.000Z`));