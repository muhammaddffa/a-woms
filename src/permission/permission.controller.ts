import { Controller, Get } from '@nestjs/common';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { PermissionService } from './permission.service.js';

// Hanya baca. Daftar permission dibuat developer (permission.constant.ts + seed);
// yang diatur admin adalah role mana memegang permission apa.
@Controller('permissions')
@Permissions(PERMISSIONS.ROLE_MANAGE.code)
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Get()
  listGrouped() {
    return this.permissionService.listGrouped();
  }
}