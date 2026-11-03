import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  costNoteSchema,
  costReasonSchema,
  type CostNoteDto,
  type CostReasonDto,
} from './dto/work-order-cost.dto.js';
import { WorkOrderCostService } from './work-order-cost.service.js';

@Controller('work-orders/:id/cost')
export class WorkOrderCostController {
  constructor(private readonly costService: WorkOrderCostService) {}

  @Post('check')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.WORK_ORDER_COST_CHECK.code)
  check(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(costNoteSchema)) dto: CostNoteDto,
  ) {
    return this.costService.check(actor, id, dto.note);
  }

  @Post('approve')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.WORK_ORDER_COST_APPROVE.code)
  approve(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(costNoteSchema)) dto: CostNoteDto,
  ) {
    return this.costService.approve(actor, id, dto.note);
  }

  // Izin (check ATAU approve) diperiksa di service.
  @Post('reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(costReasonSchema)) dto: CostReasonDto,
  ) {
    return this.costService.reject(actor, id, dto.reason);
  }

  @Post('revert')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.WORK_ORDER_COST_APPROVE.code)
  revert(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(costReasonSchema)) dto: CostReasonDto,
  ) {
    return this.costService.revert(actor, id, dto.reason);
  }

  @Get('history')
  @Permissions(PERMISSIONS.WORK_ORDER_VIEW.code)
  history(@CurrentUser() actor: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.costService.history(actor, id);
  }
}
