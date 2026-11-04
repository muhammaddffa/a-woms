import { z } from 'zod';
import { uuidSchema } from '../../common/dto/uuid.dto.js';
import { moneySchema, quantitySchema } from '../../common/utils/decimal.util.js';

export const createBillableChargeSchema = z.object({
  chargeTypeId: uuidSchema,
  quantity: quantitySchema.default(1),
  unitPrice: moneySchema,
  note: z.string().trim().max(255).optional(),
});
export type CreateBillableChargeDto = z.infer<typeof createBillableChargeSchema>;

export const updateBillableChargeSchema = z
  .object({
    quantity: quantitySchema.optional(),
    unitPrice: moneySchema.optional(),
    note: z.string().trim().max(255).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Tidak ada data yang diubah' });
export type UpdateBillableChargeDto = z.infer<typeof updateBillableChargeSchema>;
