import { Injectable } from '@nestjs/common';
import type { LookupQuery } from '../common/dto/lookup-query.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  // Hanya baca. CRUD lengkap (permission master:manage) menyusul.
  list(query: LookupQuery) {
    return this.prisma.customer.findMany({
      where: {
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.search ? { OR: [{ code: { contains: query.search, mode: 'insensitive' } }, { name: { contains: query.search, mode: 'insensitive' } }] } : {}),
      },
      select: { id: true, code: true, name: true, paymentTermsDays: true, isActive: true },
      orderBy: { name: 'asc' },
      take: 200,
    });
  }
}
