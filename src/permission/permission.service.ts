import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  // Daftar permission dikelompokkan per modul, untuk ditampilkan sebagai
  // checklist di halaman pengaturan role.
  async listGrouped() {
    const rows = await this.prisma.permission.findMany({
      select: { id: true, code: true, module: true, description: true },
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    });
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = groups.get(row.module) ?? [];
      list.push(row);
      groups.set(row.module, list);
    }
    return [...groups.entries()].map(([module, permissions]) => ({ module, permissions }));
  }
}
