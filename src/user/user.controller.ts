import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  createUserSchema,
  listUsersQuerySchema,
  resetPasswordSchema,
  setUserRolesSchema,
  updateUserSchema,
  type CreateUserDto,
  type ListUsersQuery,
  type ResetPasswordDto,
  type SetUserRolesDto,
  type UpdateUserDto,
} from './dto/user.dto.js';
import { UserService } from './user.service.js';

@Controller('users')
@Permissions(PERMISSIONS.USER_MANAGE.code)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
  ) {
    return this.userService.list(query);
  }

  // Harus sebelum ':id' agar tidak dianggap sebagai id.
  @Get('meta/roles')
  roleOptions() {
    return this.userService.roleOptions();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findOne(id);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserDto,
  ) {
    return this.userService.create(actor, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserDto,
  ) {
    return this.userService.update(actor, id, dto);
  }

  @Put(':id/roles')
  setRoles(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(setUserRolesSchema)) dto: SetUserRolesDto,
  ) {
    return this.userService.setRoles(actor, id, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto,
  ) {
    return this.userService.resetPassword(actor, id, dto);
  }
}
