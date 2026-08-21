import { z } from 'zod';

/**
 * Zod-validated environment configuration.
 * Fails fast at boot with a clear error if any required variable is missing.
 */
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection URL'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),

  // SMS Gateway
  SMS_API_URL: z.string().url().optional(),
  SMS_API_KEY: z.string().optional(),

  // Payment - Chapa
  CHAPA_SECRET_KEY: z.string().optional(),
  CHAPA_WEBHOOK_SECRET: z.string().optional(),

  // Payment - Telebirr
  TELEBIRR_APP_ID: z.string().optional(),
  TELEBIRR_APP_KEY: z.string().optional(),

  // CORS
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:5174')
    .transform((val) => val.split(',')),

  // Server
  PORT: z
    .string()
    .default('3000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ✗ ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    console.error('\n╔══════════════════════════════════════════════╗');
    console.error('║  FATAL: Environment validation failed        ║');
    console.error('╚══════════════════════════════════════════════╝\n');
    console.error(formatted);
    console.error('\nCopy .env.example to .env and fill in the required values.\n');
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
