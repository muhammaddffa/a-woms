import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ChangePasswordDto, LoginDto } from './dto/auth.dto.js';
import type { AuthUser } from './types/auth.types.js';

const BCRYPT_ROUNDS = 12;

// Dipakai agar waktu respons sama baik user ada maupun tidak
// (mencegah penebakan username lewat selisih waktu).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    const passwordOk = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_HASH,
    );

    // Satu pesan generik untuk semua kegagalan.
    if (!user || !user.isActive || !passwordOk) {
      throw new UnauthorizedException('Username atau password salah');
    }

    const accessToken = await this.jwtService.signAsync({ sub: user.id });
    const authUser = await this.findActiveAuthUser(user.id);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.config.getOrThrow<number>('JWT_EXPIRES_IN_SECONDS'),
      user: authUser,
    };
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Akun tidak ditemukan');

    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Password lama salah');

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { message: 'Password berhasil diubah' };
  }

  // Memuat user + role + permission dari database. Mengembalikan null bila
  // user tidak ada atau nonaktif. Hanya role yang aktif yang dihitung.
  async findActiveAuthUser(userId: number): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        fullName: true,
        isActive: true,
        roles: {
          where: { role: { isActive: true } },
          select: {
            role: {
              select: {
                code: true,
                name: true,
                permissions: {
                  select: { permission: { select: { code: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!user || !user.isActive) return null;

    const permissions = new Set<string>();
    for (const ur of user.roles) {
      for (const rp of ur.role.permissions) {
        permissions.add(rp.permission.code);
      }
    }

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      roles: user.roles.map((ur) => ({
        code: ur.role.code,
        name: ur.role.name,
      })),
      permissions: [...permissions].sort(),
    };
  }
}
