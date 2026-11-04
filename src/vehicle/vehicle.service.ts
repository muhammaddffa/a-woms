import { Injectable } from '@nestjs/common';
import type { LookupQuery } from '../common/dto/lookup-query.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class VehicleService {
  constructor(private readonly prisma: PrismaService) {}

  // Hanya baca. CRUD lengkap (permission master:manage) menyusul.
  list(query: LookupQuery) {
    return this.prisma.vehicle.findMany({
      where: {
        ...(query.search ? { OR: [{ plateNo: { contains: query.search, mode: 'insensitive' } }, { ownerCode: { contains: query.search, mode: 'insensitive' } }] } : {}),
      },
      select: { id: true, plateNo: true, ownerCode: true, isInternal: true },
      orderBy: { plateNo: 'asc' },
      take: 200,
    });
  }
}
