import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { BillableChargeService } from './billable-charge.service.js';
import {
  createBillableChargeSchema,
  updateBillableChargeSchema,
  type CreateBillableChargeDto,
  type UpdateBillableChargeDto,
} from './dto/billable-charge.dto.js';

@Controller('work-orders/:workOrderId')
export class BillableChargeController {
  constructor(private readonly billableChargeService: BillableChargeService) {}

  // Izin melihat (manage ATAU profit:view) diperiksa di service.
  @Get('billable-charges')
  list(
    @CurrentUser() actor: AuthUser,
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
  ) {
    return this.billableChargeService.list(actor, workOrderId);
  }

  @Post('items/:itemId/billable-charges')
  @Permissions(PERMISSIONS.BILLABLE_CHARGE_MANAGE.code)
  create(
    @CurrentUser() actor: AuthUser,
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Param('itemId', ParseIdPipe) itemId: string,
    @Body(new ZodValidationPipe(createBillableChargeSchema)) dto: CreateBillableChargeDto,
  ) {
    return this.billableChargeService.create(actor, workOrderId, itemId, dto);
  }

  @Patch('billable-charges/:id')
  @Permissions(PERMISSIONS.BILLABLE_CHARGE_MANAGE.code)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(updateBillableChargeSchema)) dto: UpdateBillableChargeDto,
  ) {
    return this.billableChargeService.update(actor, workOrderId, id, dto);
  }

  @Delete('billable-charges/:id')
  @Permissions(PERMISSIONS.BILLABLE_CHARGE_MANAGE.code)
  remove(
    @CurrentUser() actor: AuthUser,
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Param('id', ParseIdPipe) id: string,
  ) {
    return this.billableChargeService.remove(actor, workOrderId, id);
  }
}
