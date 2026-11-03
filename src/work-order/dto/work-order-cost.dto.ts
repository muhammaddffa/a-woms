import { z } from 'zod';

// Catatan opsional untuk cek/setujui. Body boleh kosong.
export const costNoteSchema = z
  .object({ note: z.string().trim().max(255).optional() })
  .default({});
export type CostNoteDto = z.infer<typeof costNoteSchema>;

// Tolak/kembalikan wajib disertai alasan.
export const costReasonSchema = z.object({
  reason: z.string().trim().min(3, 'Alasan minimal 3 karakter').max(255),
});
export type CostReasonDto = z.infer<typeof costReasonSchema>;
