import { z } from 'zod';
import { idSchema } from '../../common/dto/id.dto.js';

const text = (max: number) => z.string().trim().max(max);

// Dipakai bersama oleh pembuatan item dan perubahan item.
// loadType sengaja tanpa default di sini agar update parsial tidak menimpanya.
const itemBase = z.object({
  direction: z.enum(['EXPORT', 'IMPORT']).nullable().optional(),
  referenceNo: text(60).nullable().optional(),
  loadType: z.enum(['FCL', 'LCL']).optional(),
  containerSize: text(10).nullable().optional(),
  containerNo: z.string().trim().toUpperCase().max(20).nullable().optional(),
  sealNo: text(40).nullable().optional(),
  vehicleId: idSchema.nullable().optional(),
  driverId: idSchema.nullable().optional(),
  origin: text(120).nullable().optional(),
  destination: text(120).nullable().optional(),
});

export const createWorkOrderItemSchema = itemBase.extend({
  loadType: z.enum(['FCL', 'LCL']).default('FCL'),
});
export type CreateWorkOrderItemDto = z.infer<typeof createWorkOrderItemSchema>;

export const updateWorkOrderItemSchema = itemBase
  .extend({ status: z.enum(['ACTIVE', 'CANCELLED']).optional() })
  .refine((d) => Object.keys(d).length > 0, { message: 'Tidak ada data yang diubah' });
export type UpdateWorkOrderItemDto = z.infer<typeof updateWorkOrderItemSchema>;
