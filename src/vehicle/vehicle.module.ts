import { Module } from '@nestjs/common';
import { VehicleController } from './vehicle.controller.js';
import { VehicleService } from './vehicle.service.js';

@Module({
  controllers: [VehicleController],
  providers: [VehicleService],
  exports: [VehicleService],
})
export class VehicleModule {}
