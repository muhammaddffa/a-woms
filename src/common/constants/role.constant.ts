import type { AuthUser } from '../../auth/types/auth.types.js';
import { PERMISSIONS } from './permission.constant.js';

export const SUPER_ADMIN_ROLE_CODE = 'SUPER_ADMIN';

// Permission yang hanya boleh diberikan ke sebuah role oleh Super Admin.
export const SENSITIVE_PERMISSION_CODES: readonly string[] = [
  PERMISSIONS.USER_MANAGE.code,
  PERMISSIONS.ROLE_MANAGE.code,
];

export const isSuperAdmin = (user: AuthUser): boolean =>
  user.roles.some((r) => r.code === SUPER_ADMIN_ROLE_CODE);

// Deteksi pelanggaran unique constraint tanpa bergantung pada kelas error Prisma.
export const isUniqueViolation = (e: unknown): boolean =>
  typeof e === 'object' &&
  e !== null &&
  (e as { code?: string }).code === 'P2002';
