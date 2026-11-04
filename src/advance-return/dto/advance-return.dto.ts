import { z } from 'zod';
import { dateSchema, uuidSchema } from '../../common/dto/uuid.dto.js';
import { moneySchema } from '../../common/utils/decimal.util.js';

const text = (max: number) => z.string().trim().max(max);

export const createAdvanceReturnSchema = z.object({
  returnDate: dateSchema,
  returnedBy: text(200).min(1, 'Nama penyerah/penerima wajib diisi'),
  cashAccountId: uuidSchema.optional(),
  note: text(500).optional(),
  items: z
    .array(z.object({ cashAdvanceId: uuidSchema, amount: moneySchema.refine((v) => v > 0, 'Harus lebih dari 0') }))
    .min(1)
    .max(50)
    .refine((l) => new Set(l.map((i) => i.cashAdvanceId)).size === l.length, 'Pengajuan tidak boleh dobel'),
});

export const listAdvanceReturnsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['DRAFT', 'RECEIVED', 'CANCELLED']).optional(),
  cashAdvanceId: uuidSchema.optional(),
});

export const returnReasonSchema = z.object({ reason: text(500).min(3, 'Alasan wajib diisi') });
export const returnNoteSchema = z.object({ note: text(500).optional() });

export type CreateAdvanceReturnDto = z.infer<typeof createAdvanceReturnSchema>;
export type ListAdvanceReturnsQuery = z.infer<typeof listAdvanceReturnsQuerySchema>;
