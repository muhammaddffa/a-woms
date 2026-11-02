import { SetMetadata } from '@nestjs/common';
import type { PermissionCode } from '../../common/constants/permission.constant.js';

export const PERMISSIONS_KEY = 'requiredPermissions';

// Semua permission yang disebut harus dimiliki (logika AND).
// Contoh: @Permissions(PERMISSIONS.CASH_ADVANCE_APPROVE.code)
export const Permissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
