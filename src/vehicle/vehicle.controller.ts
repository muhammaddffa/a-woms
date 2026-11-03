import { Controller, Get, Query } from '@nestjs/common';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { lookupQuerySchema, type LookupQuery } from '../common/dto/lookup-query.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { VehicleService } from './vehicle.service.js';

@Controller('vehicles')
@Permissions(PERMISSIONS.WORK_ORDER_VIEW.code)
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Get()
  list(@Query(new ZodValidationPipe(lookupQuerySchema)) query: LookupQuery) {
    return this.vehicleService.list(query);
  }
}
