import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  cancelWorkOrderSchema,
  createWorkOrderSchema,
  listWorkOrdersQuerySchema,
  updateWorkOrderSchema,
  type CancelWorkOrderDto,
  type CreateWorkOrderDto,
  type ListWorkOrdersQuery,
  type UpdateWorkOrderDto,
} from './dto/work-order.dto.js';
import { WorkOrderService } from './work-order.service.js';

@Controller('work-orders')
export class WorkOrderController {
  constructor(private readonly workOrderService: WorkOrderService) {}

  @Get()
  @Permissions(PERMISSIONS.WORK_ORDER_VIEW.code)
  list(@Query(new ZodValidationPipe(listWorkOrdersQuerySchema)) query: ListWorkOrdersQuery) {
    return this.workOrderService.list(query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.WORK_ORDER_VIEW.code)
  findOne(@Param('id', ParseIdPipe) id: string) {
    return this.workOrderService.findOne(id);
  }

  @Post()
  @Permissions(PERMISSIONS.WORK_ORDER_CREATE.code)
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createWorkOrderSchema)) dto: CreateWorkOrderDto,
  ) {
    return this.workOrderService.create(actor, dto);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.WORK_ORDER_UPDATE.code)
  update(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(updateWorkOrderSchema)) dto: UpdateWorkOrderDto,
  ) {
    return this.workOrderService.update(id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.WORK_ORDER_CANCEL.code)
  cancel(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(cancelWorkOrderSchema)) dto: CancelWorkOrderDto,
  ) {
    return this.workOrderService.cancel(actor, id, dto);
  }
}
