import { z } from 'zod';
import { uuidSchema } from '../../common/dto/uuid.dto.js';
import { moneySchema, quantitySchema } from '../../common/utils/decimal.util.js';

export const createPlannedCostSchema = z.object({
  chargeTypeId: uuidSchema,
  quantity: quantitySchema.default(1),
  unitCost: moneySchema,
  note: z.string().trim().max(255).optional(),
});
export type CreatePlannedCostDto = z.infer<typeof createPlannedCostSchema>;

export const updatePlannedCostSchema = z
  .object({
    quantity: quantitySchema.optional(),
    unitCost: moneySchema.optional(),
    note: z.string().trim().max(255).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Tidak ada data yang diubah' });
export type UpdatePlannedCostDto = z.infer<typeof updatePlannedCostSchema>;
