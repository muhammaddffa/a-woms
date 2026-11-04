import { z } from 'zod';

// Query untuk daftar data master (dropdown di form).
export const lookupQuerySchema = z.object({
  search: z.string().trim().max(64).optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});
export type LookupQuery = z.infer<typeof lookupQuerySchema>;
