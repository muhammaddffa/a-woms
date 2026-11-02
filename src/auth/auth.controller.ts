import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import {
  changePasswordSchema,
  loginSchema,
  type ChangePasswordDto,
  type LoginDto,
} from './dto/auth.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from './types/auth.types.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Dibatasi 5 percobaan per menit per IP untuk menahan brute force.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto);
  }
}
