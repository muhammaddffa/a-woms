import { Injectable } from '@nestjs/common';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

// Penyimpanan file di disk lokal (folder UPLOAD_DIR, default ./uploads).
// Hanya kunci (path relatif) yang disimpan di database. Untuk produksi, kelas ini
// dapat diganti dengan object storage tanpa mengubah kode lain.
@Injectable()
export class StorageService {
  private readonly baseDir = resolve(process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'));

  private pathFor(key: string): string {
    const full = resolve(this.baseDir, key);
    if (!full.startsWith(this.baseDir + sep)) throw new Error('Kunci penyimpanan tidak valid');
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, { flag: 'wx' });
  }

  open(key: string): ReadStream {
    return createReadStream(this.pathFor(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}
