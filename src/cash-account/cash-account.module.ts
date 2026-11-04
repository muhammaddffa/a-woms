import { Module } from '@nestjs/common';
import { CashAccountController } from './cash-account.controller.js';
import { CashAccountService } from './cash-account.service.js';

@Module({
  controllers: [CashAccountController],
  providers: [CashAccountService],
  exports: [CashAccountService],
})
export class CashAccountModule {}
