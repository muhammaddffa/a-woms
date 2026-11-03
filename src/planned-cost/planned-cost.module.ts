import { Module } from '@nestjs/common';
import { PlannedCostController } from './planned-cost.controller.js';
import { PlannedCostService } from './planned-cost.service.js';

@Module({
  controllers: [PlannedCostController],
  providers: [PlannedCostService],
  exports: [PlannedCostService],
})
export class PlannedCostModule {}
