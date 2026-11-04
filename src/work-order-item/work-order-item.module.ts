import { Module } from '@nestjs/common';
import { WorkOrderItemController } from './work-order-item.controller.js';
import { WorkOrderItemService } from './work-order-item.service.js';

@Module({
  controllers: [WorkOrderItemController],
  providers: [WorkOrderItemService],
  exports: [WorkOrderItemService],
})
export class WorkOrderItemModule {}
