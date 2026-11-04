import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { Prisma } from '../../generated/prisma/client.js';

// Prisma mengembalikan Decimal sebagai objek yang di-JSON menjadi TEKS ("312501.38").
// Interceptor ini mengubahnya menjadi angka biasa (312501.38) agar frontend bisa
// langsung memakainya. Nilai uang di sistem ini < 1 triliun dengan 2 desimal sehingga
// aman sebagai angka JSON; penjumlahan tetap dilakukan di server memakai Decimal.
function serialize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(serialize);
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) out[key] = serialize(v);
  return out;
}

@Injectable()
export class DecimalSerializerInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(serialize));
  }
}
