import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Memastikan parameter URL berbentuk UUID (pengganti pipe angka bawaan Nest).
@Injectable()
export class ParseIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      throw new BadRequestException('ID tidak valid');
    }
    return value;
  }
}
