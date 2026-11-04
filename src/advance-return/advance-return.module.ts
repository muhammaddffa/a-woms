import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AdvanceReturnController } from './advance-return.controller.js';
import { AdvanceReturnService } from './advance-return.service.js';

@Module({
  imports: [PrismaModule, ApprovalModule],
  controllers: [AdvanceReturnController],
  providers: [AdvanceReturnService],
})
export class AdvanceReturnModule {}
