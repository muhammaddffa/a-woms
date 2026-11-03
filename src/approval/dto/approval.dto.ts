import { z } from 'zod';
import { idSchema } from '../../common/dto/id.dto.js';

export const approvalParamsSchema = z.object({
  docType: z.enum(['WORK_ORDER_COST', 'CASH_ADVANCE', 'ADVANCE_RETURN']),
  docId: idSchema,
});
export type ApprovalParams = z.infer<typeof approvalParamsSchema>;
