import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import type { LookupQuery } from '../common/dto/lookup-query.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ChargeTypeService {
  constructor(private readonly prisma: PrismaService) {}

  // Hanya baca. Jenis biaya bertanda "tarif sembunyi" hanya terlihat oleh
  // pemegang permission charge:view_hidden.
  list(actor: AuthUser, query: LookupQuery) {
    const canSeeHidden = actor.permissions.includes(PERMISSIONS.CHARGE_VIEW_HIDDEN.code);
    return this.prisma.chargeType.findMany({
      where: {
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(canSeeHidden ? {} : { isHidden: false }),
        ...(query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: 'insensitive' } },
                { name: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        appliesTo: true,
        useActualCost: true,
        isTrucking: true,
        isHidden: true,
        sortOrder: true,
        defaultCost: true,
        defaultPrice: true,
        isActive: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      take: 200,
    });
  }
}
