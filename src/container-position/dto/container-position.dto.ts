import { z } from 'zod';
import { uuidSchema } from '../../common/dto/uuid.dto.js';

// Catatan opsional, mis. nama penitipan container atau gudang pihak ketiga.
export const setPositionSchema = z.object({
  positionId: uuidSchema,
  note: z.string().trim().max(255).optional(),
});
export type SetPositionDto = z.infer<typeof setPositionSchema>;
