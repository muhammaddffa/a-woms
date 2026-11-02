import { z } from 'zod';

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9._-]+$/, 'Username hanya boleh huruf kecil, angka, titik, garis bawah, dan strip');

// bcrypt hanya memakai 72 byte pertama.
const passwordSchema = z.string().min(10, 'Password minimal 10 karakter').max(72);

const roleIdsSchema = z.array(z.number().int().positive()).max(20);

export const createUserSchema = z.object({
  username: usernameSchema,
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  password: passwordSchema,
  roleIds: roleIdsSchema.default([]),
});
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Tidak ada data yang diubah' });
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

export const setUserRolesSchema = z.object({ roleIds: roleIdsSchema });
export type SetUserRolesDto = z.infer<typeof setUserRolesSchema>;

export const resetPasswordSchema = z.object({ newPassword: passwordSchema });
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(64).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;