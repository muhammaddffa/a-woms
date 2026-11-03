import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import type { RequestWithUser } from '../types/auth.types.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    // Tanpa @Permissions: cukup sudah login (JwtAuthGuard sudah memeriksa).
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) throw new ForbiddenException('Akses ditolak');

    const owned = new Set(user.permissions);
    const allowed = required.every((code) => owned.has(code));
    if (!allowed) {
      throw new ForbiddenException('Anda tidak memiliki akses untuk tindakan ini');
    }
    return true;
  }
}
