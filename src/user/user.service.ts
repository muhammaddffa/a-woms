import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { AuthUser } from '../auth/types/auth.types.js';
import {
  SUPER_ADMIN_ROLE_CODE,
  isSuperAdmin,
  isUniqueViolation,
} from '../common/constants/role.constant.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateUserDto,
  ListUsersQuery,
  ResetPasswordDto,
  SetUserRolesDto,
  UpdateUserDto,
} from './dto/user.dto.js';

const BCRYPT_ROUNDS = 12;

// passwordHash sengaja TIDAK pernah dipilih/dikembalikan.
const userSelect = {
  id: true,
  username: true,
  email: true,
  fullName: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  roles: {
    select: {
      role: { select: { id: true, code: true, name: true, isSystem: true } },
    },
  },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

const toView = (u: UserRow) => {
  const { roles, ...rest } = u;
  return { ...rest, roles: roles.map((r) => r.role) };
};

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListUsersQuery) {
    const where: Prisma.UserWhereInput = query.search
      ? {
          OR: [
            { username: { contains: query.search, mode: 'insensitive' } },
            { fullName: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: { username: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data: rows.map(toView),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: number) {
    return toView(await this.loadUser(id));
  }

  // Daftar role yang bisa dipilih saat membuat/mengubah user.
  roleOptions() {
    return this.prisma.role.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, isSystem: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    const roleIds = [...new Set(dto.roleIds)];
    await this.loadAssignableRoles(actor, roleIds);

    if (
      await this.prisma.user.findUnique({
        where: { username: dto.username },
        select: { id: true },
      })
    ) {
      throw new ConflictException('Username sudah dipakai');
    }
    if (
      dto.email &&
      (await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      }))
    ) {
      throw new ConflictException('Email sudah dipakai');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      const created = await this.prisma.user.create({
        data: {
          username: dto.username,
          email: dto.email ?? null,
          fullName: dto.fullName,
          passwordHash,
          roles: { create: roleIds.map((roleId) => ({ roleId })) },
        },
        select: userSelect,
      });
      return toView(created);
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException('Username atau email sudah dipakai');
      throw e;
    }
  }

  async update(actor: AuthUser, id: number, dto: UpdateUserDto) {
    const target = await this.loadUser(id);
    this.assertCanManage(actor, target);

    if (dto.isActive === false) {
      if (actor.id === id) {
        throw new BadRequestException(
          'Anda tidak dapat menonaktifkan akun sendiri',
        );
      }
      await this.assertNotLastSuperAdmin(target);
    }
    if (dto.email && dto.email !== target.email) {
      const taken = await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });
      if (taken) throw new ConflictException('Email sudah dipakai');
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id },
        data: dto,
        select: userSelect,
      });
      return toView(updated);
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException('Email sudah dipakai');
      throw e;
    }
  }

  async setRoles(actor: AuthUser, id: number, dto: SetUserRolesDto) {
    if (actor.id === id) {
      throw new ForbiddenException(
        'Anda tidak dapat mengubah role akun sendiri',
      );
    }
    const target = await this.loadUser(id);
    this.assertCanManage(actor, target);

    const roleIds = [...new Set(dto.roleIds)];
    const newRoles = await this.loadAssignableRoles(actor, roleIds);

    const hadSuper = target.roles.some(
      (r) => r.role.code === SUPER_ADMIN_ROLE_CODE,
    );
    const willHaveSuper = newRoles.some(
      (r) => r.code === SUPER_ADMIN_ROLE_CODE,
    );
    if (hadSuper && !willHaveSuper) await this.assertNotLastSuperAdmin(target);

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      this.prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId: id, roleId })),
        skipDuplicates: true,
      }),
    ]);
    return this.findOne(id);
  }

  async resetPassword(actor: AuthUser, id: number, dto: ResetPasswordDto) {
    if (actor.id === id) {
      throw new BadRequestException(
        'Gunakan fitur ganti password untuk akun sendiri',
      );
    }
    const target = await this.loadUser(id);
    this.assertCanManage(actor, target);

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { message: 'Password berhasil direset' };
  }

  // ---------------- aturan keamanan ----------------

  private async loadUser(id: number): Promise<UserRow> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    return user;
  }

  // Hanya Super Admin yang boleh mengelola user yang berstatus Super Admin.
  private assertCanManage(actor: AuthUser, target: UserRow) {
    const targetIsSuper = target.roles.some(
      (r) => r.role.code === SUPER_ADMIN_ROLE_CODE,
    );
    if (targetIsSuper && !isSuperAdmin(actor)) {
      throw new ForbiddenException(
        'Hanya Super Admin yang dapat mengelola akun Super Admin',
      );
    }
  }

  // Role harus ada dan aktif. Role bawaan (system) hanya boleh diberikan Super Admin.
  private async loadAssignableRoles(actor: AuthUser, roleIds: number[]) {
    if (roleIds.length === 0) return [];
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, code: true, isActive: true, isSystem: true },
    });
    if (roles.length !== roleIds.length)
      throw new BadRequestException('Ada role yang tidak ditemukan');
    if (roles.some((r) => !r.isActive))
      throw new BadRequestException('Ada role yang tidak aktif');
    if (roles.some((r) => r.isSystem) && !isSuperAdmin(actor)) {
      throw new ForbiddenException(
        'Hanya Super Admin yang dapat memberikan role bawaan',
      );
    }
    return roles;
  }

  // Mencegah sistem terkunci tanpa Super Admin aktif.
  private async assertNotLastSuperAdmin(target: UserRow) {
    if (!target.roles.some((r) => r.role.code === SUPER_ADMIN_ROLE_CODE))
      return;
    const others = await this.prisma.user.count({
      where: {
        id: { not: target.id },
        isActive: true,
        roles: {
          some: { role: { code: SUPER_ADMIN_ROLE_CODE, isActive: true } },
        },
      },
    });
    if (others === 0) {
      throw new BadRequestException(
        'Minimal harus ada satu Super Admin yang aktif',
      );
    }
  }
}
