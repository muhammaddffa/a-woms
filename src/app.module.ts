import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
// import { AppController } from './app.controller.js';
// import { AppService } from './app.service.js';
import { ApprovalModule } from './approval/approval.module.js';
import { BillableChargeModule } from './billable-charge/billable-charge.module.js';
import { PlannedCostModule } from './planned-cost/planned-cost.module.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './auth/guards/permissions.guard.js';
import { DecimalSerializerInterceptor } from './common/interceptors/decimal-serializer.interceptor.js';
import { validateEnv } from './config/env.config.js';
import { CashAccountModule } from './cash-account/cash-account.module.js';
import { ChargeTypeModule } from './charge-type/charge-type.module.js';
import { CustomerModule } from './customer/customer.module.js';
import { DriverModule } from './driver/driver.module.js';
import { VehicleModule } from './vehicle/vehicle.module.js';
import { WorkOrderModule } from './work-order/work-order.module.js';
import { WorkOrderItemModule } from './work-order-item/work-order-item.module.js';
import { PermissionModule } from './permission/permission.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RoleModule } from './role/role.module.js';
import { UserModule } from './user/user.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    UserModule,
    RoleModule,
    PermissionModule,
    CashAccountModule,
    ChargeTypeModule,
    CustomerModule,
    DriverModule,
    VehicleModule,
    WorkOrderModule,
    WorkOrderItemModule,
    ApprovalModule,
    BillableChargeModule,
    PlannedCostModule,
  ],
  // controllers: [AppController],
  providers: [
    // AppService,
    // Urutan penting: batasi laju -> wajib login -> cek permission.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Decimal -> angka biasa di semua respons.
    { provide: APP_INTERCEPTOR, useClass: DecimalSerializerInterceptor },
  ],
})
export class AppModule {}
