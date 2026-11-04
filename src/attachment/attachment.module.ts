import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AttachmentController } from './attachment.controller.js';
import { AttachmentService } from './attachment.service.js';
import { StorageService } from './storage.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [AttachmentController],
  providers: [AttachmentService, StorageService],
  exports: [AttachmentService],
})
export class AttachmentModule {}
