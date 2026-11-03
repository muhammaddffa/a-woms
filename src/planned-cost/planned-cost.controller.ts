import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  createPlannedCostSchema,
  updatePlannedCostSchema,
  type CreatePlannedCostDto,
  type UpdatePlannedCostDto,
} from './dto/planned-cost.dto.js';
import { PlannedCostService } from './planned-cost.service.js';

@Controller('work-orders/:workOrderId')
export class PlannedCostController {
  constructor(private readonly plannedCostService: PlannedCostService) {}

  @Get('planned-costs')
  @Permissions(PERMISSIONS.WORK_ORDER_VIEW.code)
  list(
    @CurrentUser() actor: AuthUser,
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
  ) {
    return this.plannedCostService.list(actor, workOrderId);
  }

  @Post('items/:itemId/planned-costs')
  @Permissions(PERMISSIONS.PLANNED_COST_MANAGE.code)
  create(
    @CurrentUser() actor: AuthUser,
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Param('itemId', ParseIdPipe) itemId: string,
    @Body(new ZodValidationPipe(createPlannedCostSchema)) dto: CreatePlannedCostDto,
  ) {
    return this.plannedCostService.create(actor, workOrderId, itemId, dto);
  }

  @Patch('planned-costs/:id')
  @Permissions(PERMISSIONS.PLANNED_COST_MANAGE.code)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(updatePlannedCostSchema)) dto: UpdatePlannedCostDto,
  ) {
    return this.plannedCostService.update(actor, workOrderId, id, dto);
  }

  @Delete('planned-costs/:id')
  @Permissions(PERMISSIONS.PLANNED_COST_MANAGE.code)
  remove(
    @CurrentUser() actor: AuthUser,
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Param('id', ParseIdPipe) id: string,
  ) {
    return this.plannedCostService.remove(actor, workOrderId, id);
  }
}
