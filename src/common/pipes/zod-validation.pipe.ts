import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

// Jika Anda sudah menyalin pipe ini dari proyek lama, pakai milik Anda
// selama bentuknya sama: new ZodValidationPipe(schema).
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validasi gagal',
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
