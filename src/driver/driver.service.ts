import { Injectable } from '@nestjs/common';
import type { LookupQuery } from '../common/dto/lookup-query.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DriverService {
  constructor(private readonly prisma: PrismaService) {}

  // Hanya baca. CRUD lengkap (permission master:manage) menyusul.
  list(query: LookupQuery) {
    return this.prisma.driver.findMany({
      where: {
        ...(query.search ? { OR: [{ code: { contains: query.search, mode: 'insensitive' } }, { name: { contains: query.search, mode: 'insensitive' } }] } : {}),
      },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
      take: 200,
    });
  }
}
