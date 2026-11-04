import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth.types.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { ApprovalService } from './approval.service.js';
import { approvalParamsSchema, type ApprovalParams } from './dto/approval.dto.js';

@Controller('approvals')
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  // Izin melihat ditentukan per jenis dokumen di ApprovalService.
  @Get(':docType/:docId')
  list(
    @CurrentUser() actor: AuthUser,
    @Param(new ZodValidationPipe(approvalParamsSchema)) params: ApprovalParams,
  ) {
    return this.approvalService.list(actor, params.docType, params.docId);
  }
}
