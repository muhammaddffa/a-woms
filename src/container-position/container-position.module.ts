import { Module } from '@nestjs/common';
import { ContainerPositionController } from './container-position.controller.js';
import { ContainerPositionService } from './container-position.service.js';

// PrismaService diasumsikan global; bila tidak, tambahkan PrismaModule ke imports
// seperti pada modul lain (mis. work-order-item.module.ts).
@Module({
  controllers: [ContainerPositionController],
  providers: [ContainerPositionService],
})
export class ContainerPositionModule {}
