import { z } from 'zod';
import { idSchema } from '../../common/dto/id.dto.js';
import { moneySchema, quantitySchema } from '../../common/utils/decimal.util.js';

export const createBillableChargeSchema = z.object({
  chargeTypeId: idSchema,
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
