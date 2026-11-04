import { z } from 'zod';
import { moneySchema } from '../../common/utils/decimal.util.js';

export const docTypeSchema = z.enum(['WORK_ORDER_COST', 'CASH_ADVANCE', 'ADVANCE_RETURN']);
export const stepSchema = z.enum([
  'CHECK',
  'APPROVE',
  'PAY',
  'VERIFY_TRANSFER',
  'REPORT_SUBMIT',
  'REPORT_CHECK',
  'REPORT_APPROVE',
  'RECEIVE',
]);

export const updateWorkflowSettingSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    minAmount: moneySchema.optional(),
  })
  .refine((v) => v.isEnabled !== undefined || v.minAmount !== undefined, 'Isi minimal satu perubahan');

export type UpdateWorkflowSettingDto = z.infer<typeof updateWorkflowSettingSchema>;
