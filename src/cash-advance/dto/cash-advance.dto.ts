import { z } from 'zod';
import { dateSchema, uuidSchema } from '../../common/dto/uuid.dto.js';
import { moneySchema } from '../../common/utils/decimal.util.js';

const positiveMoney = moneySchema.refine((v) => v > 0, 'Harus lebih dari 0');
const text = (max: number) => z.string().trim().max(max);

export const CASH_ADVANCE_STATUSES = [
  'DRAFT',
  'CHECKED',
  'APPROVED',
  'PAID',
  'TRANSFER_VERIFIED',
  'REPORT_SUBMITTED',
  'REPORT_CHECKED',
  'REPORT_APPROVED',
  'SETTLED',
  'REJECTED',
  'CANCELLED',
] as const;

const itemsInput = z
  .array(
    z.object({
      plannedCostId: uuidSchema,
      advanceAmount: positiveMoney,
      note: text(500).optional(),
    }),
  )
  .min(1, 'Minimal satu baris')
  .max(100, 'Maksimal 100 baris')
  .refine(
    (list) => new Set(list.map((i) => i.plannedCostId)).size === list.length,
    'Rencana biaya tidak boleh dobel dalam satu pengajuan',
  );

export const createCashAdvanceSchema = z.object({
  workOrderId: uuidSchema,
  advanceType: z.enum(['OPERATIONAL', 'DRIVER_ALLOWANCE']),
  advanceDate: dateSchema,
  recipient: text(200).min(1, 'Penerima wajib diisi'),
  holderId: uuidSchema.optional(),
  description: text(1000).optional(),
  items: itemsInput,
});

export const updateCashAdvanceSchema = z
  .object({
    recipient: text(200).min(1, 'Penerima wajib diisi').optional(),
    holderId: uuidSchema.optional(),
    description: text(1000).optional(),
    items: itemsInput.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Isi minimal satu perubahan');

export const listCashAdvancesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: text(50).optional(),
  workOrderId: uuidSchema.optional(),
  status: z.enum(CASH_ADVANCE_STATUSES).optional(),
  advanceType: z.enum(['OPERATIONAL', 'DRIVER_ALLOWANCE']).optional(),
  holderId: uuidSchema.optional(),
});

export const noteSchema = z.object({ note: text(500).optional() });
export const reasonSchema = z.object({ reason: text(500).min(3, 'Alasan wajib diisi') });

export const paySchema = z.object({
  cashAccountId: uuidSchema,
  transferFee: moneySchema.optional(),
  note: text(500).optional(),
});

// LPJ: realisasi per baris pengajuan (boleh 0 bila tidak terpakai).
export const actualsSchema = z.object({
  items: z
    .array(z.object({ itemId: uuidSchema, actualAmount: moneySchema, note: text(500).optional() }))
    .min(1)
    .max(100)
    .refine((l) => new Set(l.map((i) => i.itemId)).size === l.length, 'Baris tidak boleh dobel'),
});

export const createExtraCostSchema = z.object({
  workOrderItemId: uuidSchema,
  chargeTypeId: uuidSchema,
  description: text(200).min(1, 'Keterangan wajib diisi'),
  amount: positiveMoney,
  billable: z.boolean().default(true),
  note: text(500).optional(),
});

export const updateExtraCostSchema = z
  .object({
    chargeTypeId: uuidSchema.optional(),
    description: text(200).min(1).optional(),
    amount: positiveMoney.optional(),
    billable: z.boolean().optional(),
    note: text(500).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Isi minimal satu perubahan');

export type CreateCashAdvanceDto = z.infer<typeof createCashAdvanceSchema>;
export type UpdateCashAdvanceDto = z.infer<typeof updateCashAdvanceSchema>;
export type ListCashAdvancesQuery = z.infer<typeof listCashAdvancesQuerySchema>;
export type NoteDto = z.infer<typeof noteSchema>;
export type ReasonDto = z.infer<typeof reasonSchema>;
export type PayDto = z.infer<typeof paySchema>;
export type ActualsDto = z.infer<typeof actualsSchema>;
export type CreateExtraCostDto = z.infer<typeof createExtraCostSchema>;
export type UpdateExtraCostDto = z.infer<typeof updateExtraCostSchema>;
