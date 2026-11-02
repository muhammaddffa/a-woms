import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './auth/guards/permissions.guard.js';
import { validateEnv } from './config/env.config.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UserModule } from './user/user.module.js';
import { PermissionModule } from './permission/permission.module.js';
import { RoleModule } from './role/role.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    RoleModule,
    PermissionModule,
    UserModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Urutan penting: batasi laju -> wajib login -> cek permission.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
