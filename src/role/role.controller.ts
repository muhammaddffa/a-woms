import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  createRoleSchema,
  setRolePermissionsSchema,
  updateRoleSchema,
  type CreateRoleDto,
  type SetRolePermissionsDto,
  type UpdateRoleDto,
} from './dto/role.dto.js';
import { RoleService } from './role.service.js';

@Controller('roles')
@Permissions(PERMISSIONS.ROLE_MANAGE.code)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  list() {
    return this.roleService.list();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.roleService.findOne(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createRoleSchema)) dto: CreateRoleDto) {
    return this.roleService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(updateRoleSchema)) dto: UpdateRoleDto,
  ) {
    return this.roleService.update(id, dto);
  }

  @Put(':id/permissions')
  setPermissions(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(setRolePermissionsSchema))
    dto: SetRolePermissionsDto,
  ) {
    return this.roleService.setPermissions(actor, id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.roleService.remove(id);
  }
}
