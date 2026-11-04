import { z } from 'zod';
import { uuidSchema } from '../../common/dto/uuid.dto.js';

export const approvalParamsSchema = z.object({
  docType: z.enum(['WORK_ORDER_COST', 'CASH_ADVANCE', 'ADVANCE_RETURN']),
  docId: uuidSchema,
});
export type ApprovalParams = z.infer<typeof approvalParamsSchema>;
