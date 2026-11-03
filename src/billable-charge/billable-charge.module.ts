import { Module } from '@nestjs/common';
import { BillableChargeController } from './billable-charge.controller.js';
import { BillableChargeService } from './billable-charge.service.js';

@Module({
  controllers: [BillableChargeController],
  providers: [BillableChargeService],
  exports: [BillableChargeService],
})
export class BillableChargeModule {}
