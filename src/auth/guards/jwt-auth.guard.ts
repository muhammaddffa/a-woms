import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { AuthService } from '../auth.service.js';
import type { JwtPayload, RequestWithUser } from '../types/auth.types.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractBearerToken(request);
    if (!token) throw new UnauthorizedException('Token tidak ditemukan');

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token tidak valid atau kedaluwarsa');
    }

    const user = await this.authService.findActiveAuthUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Akun tidak aktif atau tidak ditemukan');
    }

    request.user = user;
    return true;
  }

  private extractBearerToken(request: RequestWithUser): string | undefined {
    const header = request.headers['authorization'];
    if (typeof header !== 'string') return undefined;
    const [type, token] = header.split(' ');
    return type === 'Bearer' && token ? token : undefined;
  }
}
