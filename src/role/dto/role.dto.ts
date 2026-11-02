import { z } from 'zod';

export const createRoleSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z][A-Z0-9_]{1,49}$/,
      'Kode role: huruf besar, angka, garis bawah (2-50 karakter), diawali huruf',
    ),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(255).optional(),
});
export type CreateRoleDto = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(255).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Tidak ada data yang diubah',
  });
export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;

export const setRolePermissionsSchema = z.object({
  permissionCodes: z.array(z.string().trim().min(1).max(100)).max(200),
});
export type SetRolePermissionsDto = z.infer<typeof setRolePermissionsSchema>;
