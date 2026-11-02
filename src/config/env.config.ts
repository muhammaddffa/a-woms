import { z } from 'zod';

// Aplikasi menolak start jika konfigurasi wajib tidak valid (fail fast).
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET minimal 32 karakter'),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(900),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return envSchema.parse(config);
}
