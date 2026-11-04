import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  createWorkOrderItemSchema,
  updateWorkOrderItemSchema,
  type CreateWorkOrderItemDto,
  type UpdateWorkOrderItemDto,
} from './dto/work-order-item.dto.js';
import { WorkOrderItemService } from './work-order-item.service.js';

@Controller('work-orders/:workOrderId/items')
@Permissions(PERMISSIONS.WORK_ORDER_UPDATE.code)
export class WorkOrderItemController {
  constructor(private readonly itemService: WorkOrderItemService) {}

  @Post()
  create(
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Body(new ZodValidationPipe(createWorkOrderItemSchema)) dto: CreateWorkOrderItemDto,
  ) {
    return this.itemService.create(workOrderId, dto);
  }

  @Patch(':itemId')
  update(
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Param('itemId', ParseIdPipe) itemId: string,
    @Body(new ZodValidationPipe(updateWorkOrderItemSchema)) dto: UpdateWorkOrderItemDto,
  ) {
    return this.itemService.update(workOrderId, itemId, dto);
  }

  @Delete(':itemId')
  remove(
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Param('itemId', ParseIdPipe) itemId: string,
  ) {
    return this.itemService.remove(workOrderId, itemId);
  }
}
