import { Controller, Get, Query } from '@nestjs/common';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { lookupQuerySchema, type LookupQuery } from '../common/dto/lookup-query.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { DriverService } from './driver.service.js';

@Controller('drivers')
@Permissions(PERMISSIONS.WORK_ORDER_VIEW.code)
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @Get()
  list(@Query(new ZodValidationPipe(lookupQuerySchema)) query: LookupQuery) {
    return this.driverService.list(query);
  }
}
