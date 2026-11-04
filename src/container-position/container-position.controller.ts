import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { setPositionSchema, type SetPositionDto } from './dto/container-position.dto.js';
import { ContainerPositionService } from './container-position.service.js';

@Controller()
export class ContainerPositionController {
  constructor(private readonly service: ContainerPositionService) {}

  @Get('container-positions')
  @Permissions(PERMISSIONS.WORK_ORDER_VIEW.code)
  list() {
    return this.service.listPositions();
  }

  @Post('work-orders/:workOrderId/items/:itemId/position')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.CONTAINER_POSITION_UPDATE.code)
  setPosition(
    @CurrentUser() actor: AuthUser,
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Param('itemId', ParseIdPipe) itemId: string,
    @Body(new ZodValidationPipe(setPositionSchema)) dto: SetPositionDto,
  ) {
    return this.service.setPosition(actor, workOrderId, itemId, dto);
  }

  @Get('work-orders/:workOrderId/items/:itemId/position-history')
  @Permissions(PERMISSIONS.WORK_ORDER_VIEW.code)
  history(
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Param('itemId', ParseIdPipe) itemId: string,
  ) {
    return this.service.history(workOrderId, itemId);
  }
}
