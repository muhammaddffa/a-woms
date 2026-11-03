import { z } from 'zod';

// Semua ID di sistem ini berbentuk UUID (v7). Dipakai di body dan query.
export const idSchema = z.string().uuid('ID tidak valid');
