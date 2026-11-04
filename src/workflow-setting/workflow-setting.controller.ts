import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { ApprovalDocType, ApprovalStep } from '../generated/prisma/enums.js';
import {
  docTypeSchema,
  stepSchema,
  updateWorkflowSettingSchema,
  type UpdateWorkflowSettingDto,
} from './dto/workflow-setting.dto.js';
import { WorkflowSettingService } from './workflow-setting.service.js';

@Controller('workflow-settings')
export class WorkflowSettingController {
  constructor(private readonly service: WorkflowSettingService) {}

  @Get()
  @Permissions(PERMISSIONS.WORKFLOW_MANAGE.code)
  list() {
    return this.service.list();
  }

  @Put(':docType/:step')
  @Permissions(PERMISSIONS.WORKFLOW_MANAGE.code)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('docType', new ZodValidationPipe(docTypeSchema)) docType: ApprovalDocType,
    @Param('step', new ZodValidationPipe(stepSchema)) step: ApprovalStep,
    @Body(new ZodValidationPipe(updateWorkflowSettingSchema)) dto: UpdateWorkflowSettingDto,
  ) {
    return this.service.update(actor, docType, step, dto);
  }
}
