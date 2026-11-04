import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module.js';
import { AttachmentModule } from '../attachment/attachment.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { WorkflowSettingModule } from '../workflow-setting/workflow-setting.module.js';
import { CashAdvanceReportService } from './cash-advance-report.service.js';
import { CashAdvanceController } from './cash-advance.controller.js';
import { CashAdvanceService } from './cash-advance.service.js';

@Module({
  imports: [PrismaModule, ApprovalModule, WorkflowSettingModule, AttachmentModule],
  controllers: [CashAdvanceController],
  providers: [CashAdvanceService, CashAdvanceReportService],
  exports: [CashAdvanceService],
})
export class CashAdvanceModule {}
