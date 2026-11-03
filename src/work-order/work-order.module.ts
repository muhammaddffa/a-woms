import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module.js';
import { WorkOrderItemModule } from '../work-order-item/work-order-item.module.js';
import { WorkOrderCostController } from './work-order-cost.controller.js';
import { WorkOrderCostService } from './work-order-cost.service.js';
import { WorkOrderController } from './work-order.controller.js';
import { WorkOrderService } from './work-order.service.js';

@Module({
  imports: [WorkOrderItemModule, ApprovalModule],
  controllers: [WorkOrderController, WorkOrderCostController],
  providers: [WorkOrderService, WorkOrderCostService],
  exports: [WorkOrderService],
})
export class WorkOrderModule {}
