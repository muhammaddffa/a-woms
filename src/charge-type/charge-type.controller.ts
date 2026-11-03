import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { lookupQuerySchema, type LookupQuery } from '../common/dto/lookup-query.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { ChargeTypeService } from './charge-type.service.js';

@Controller('charge-types')
@Permissions(PERMISSIONS.WORK_ORDER_VIEW.code)
export class ChargeTypeController {
  constructor(private readonly chargeTypeService: ChargeTypeService) {}

  @Get()
  list(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(lookupQuerySchema)) query: LookupQuery,
  ) {
    return this.chargeTypeService.list(actor, query);
  }
}
