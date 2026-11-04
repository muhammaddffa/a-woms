import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { AdvanceReturnService } from './advance-return.service.js';
import {
  createAdvanceReturnSchema,
  listAdvanceReturnsQuerySchema,
  returnNoteSchema,
  returnReasonSchema,
  type CreateAdvanceReturnDto,
  type ListAdvanceReturnsQuery,
} from './dto/advance-return.dto.js';

@Controller('advance-returns')
export class AdvanceReturnController {
  constructor(private readonly service: AdvanceReturnService) {}

  @Get()
  @Permissions(PERMISSIONS.CASH_ADVANCE_VIEW.code)
  list(@Query(new ZodValidationPipe(listAdvanceReturnsQuerySchema)) query: ListAdvanceReturnsQuery) {
    return this.service.list(query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.CASH_ADVANCE_VIEW.code)
  findOne(@Param('id', ParseIdPipe) id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/history')
  @Permissions(PERMISSIONS.CASH_ADVANCE_VIEW.code)
  history(@CurrentUser() actor: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.service.history(actor, id);
  }

  // Izin bergantung pada arah (pengembalian atau penggantian); diperiksa di service.
  @Post()
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createAdvanceReturnSchema)) dto: CreateAdvanceReturnDto,
  ) {
    return this.service.create(actor, dto);
  }

  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  receive(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(returnNoteSchema)) dto: { note?: string },
  ) {
    return this.service.receive(actor, id, dto.note);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(returnReasonSchema)) dto: { reason: string },
  ) {
    return this.service.cancel(actor, id, dto.reason);
  }
}
