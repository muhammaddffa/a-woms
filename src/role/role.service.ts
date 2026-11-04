import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/types/auth.types.js';
import {
  SENSITIVE_PERMISSION_CODES,
  isSuperAdmin,
  isUniqueViolation,
} from '../common/constants/role.constant.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateRoleDto,
  SetRolePermissionsDto,
  UpdateRoleDto,
} from './dto/role.dto.js';

const roleSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  isSystem: true,
  isActive: true,
  createdAt: true,
  _count: { select: { users: true, permissions: true } },
} satisfies Prisma.RoleSelect;

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.role.findMany({ select: roleSelect, orderBy: { code: 'asc' } });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: {
        ...roleSelect,
        permissions: {
          select: {
            permission: { select: { id: true, code: true, module: true, description: true } },
          },
        },
      },
    });
    if (!role) throw new NotFoundException('Role tidak ditemukan');
    const { permissions, ...rest } = role;
    return {
      ...rest,
      permissions: permissions
        .map((p) => p.permission)
        .sort((a, b) => a.code.localeCompare(b.code)),
    };
  }

  async create(dto: CreateRoleDto) {
    if (await this.prisma.role.findUnique({ where: { code: dto.code }, select: { id: true } })) {
      throw new ConflictException('Kode role sudah dipakai');
    }
    try {
      return await this.prisma.role.create({
        data: { code: dto.code, name: dto.name, description: dto.description ?? null },
        select: roleSelect,
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Kode role sudah dipakai');
      throw e;
    }
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id }, select: { isSystem: true } });
    if (!role) throw new NotFoundException('Role tidak ditemukan');
    if (role.isSystem && dto.isActive === false) {
      throw new ForbiddenException('Role bawaan tidak dapat dinonaktifkan');
    }
    return this.prisma.role.update({ where: { id }, data: dto, select: roleSelect });
  }

  // Mengganti seluruh isi permission sebuah role.
  async setPermissions(actor: AuthUser, id: string, dto: SetRolePermissionsDto) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: {
        id: true,
        isSystem: true,
        permissions: { select: { permission: { select: { code: true } } } },
      },
    });
    if (!role) throw new NotFoundException('Role tidak ditemukan');
    if (role.isSystem) {
      throw new ForbiddenException('Role bawaan tidak dapat diubah hak aksesnya');
    }

    const codes = [...new Set(dto.permissionCodes)];
    const found = await this.prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    if (found.length !== codes.length) {
      const known = new Set(found.map((f) => f.code));
      const unknown = codes.filter((c) => !known.has(c));
      throw new BadRequestException(`Permission tidak dikenal: ${unknown.join(', ')}`);
    }

    // Hak akses administrasi hanya boleh ditambahkan oleh Super Admin.
    const current = new Set(role.permissions.map((p) => p.permission.code));
    const added = codes.filter((c) => !current.has(c));
    if (!isSuperAdmin(actor) && added.some((c) => SENSITIVE_PERMISSION_CODES.includes(c))) {
      throw new ForbiddenException(
        'Hanya Super Admin yang dapat memberikan hak akses pengelolaan user/role',
      );
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.rolePermission.createMany({
        data: found.map((f) => ({ roleId: id, permissionId: f.id })),
        skipDuplicates: true,
      }),
    ]);
    return this.findOne(id);
  }

  async remove(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: { isSystem: true, _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('Role tidak ditemukan');
    if (role.isSystem) throw new ForbiddenException('Role bawaan tidak dapat dihapus');
    if (role._count.users > 0) {
      throw new ConflictException(
        `Role masih dipakai ${role._count.users} user. Lepaskan dari user terlebih dahulu atau nonaktifkan role.`,
      );
    }
    await this.prisma.role.delete({ where: { id } });
    return { message: 'Role berhasil dihapus' };
  }
}
