import { z } from 'zod';

// bcrypt hanya memakai 72 byte pertama, jadi password dibatasi 72 karakter.
export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(64),
  password: z.string().min(1).max(72),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(72),
    newPassword: z
      .string()
      .min(10, 'Password baru minimal 10 karakter')
      .max(72),
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'Password baru harus berbeda dari password lama',
    path: ['newPassword'],
  });
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
