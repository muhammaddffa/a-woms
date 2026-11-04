import { Module } from '@nestjs/common';
import { ChargeTypeController } from './charge-type.controller.js';
import { ChargeTypeService } from './charge-type.service.js';

@Module({
  controllers: [ChargeTypeController],
  providers: [ChargeTypeService],
  exports: [ChargeTypeService],
})
export class ChargeTypeModule {}
