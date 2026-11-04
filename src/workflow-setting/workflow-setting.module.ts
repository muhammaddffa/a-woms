import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { WorkflowSettingController } from './workflow-setting.controller.js';
import { WorkflowSettingService } from './workflow-setting.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [WorkflowSettingController],
  providers: [WorkflowSettingService],
  exports: [WorkflowSettingService],
})
export class WorkflowSettingModule {}
