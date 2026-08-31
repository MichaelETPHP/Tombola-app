import { z } from 'zod';

/**
 * Docker Compose (and some other env-injection paths) sets a variable to
 * an empty string rather than omitting it entirely when `${VAR}` has
 * nothing to substitute — Zod's `.optional()`/`.default()` only kick in
 * for `undefined`, not `''`, so without this every optional/defaulted URL
 * field below would hard-fail validation on a totally normal "not
 * configured yet" deployment. Wrap those fields in this instead of using
 * them raw.
 */
const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === '' ? undefined : val), schema);

/**
 * Zod-validated environment configuration.
 * Fails fast at boot with a clear error if any required variable is missing.
 */
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection URL'),
  DB_SCHEMA: z.string().default('Tombola_DB'),

  // Supabase Storage. The service-role key is server-only and must never be
  // exposed through a VITE_ variable or returned by an API response.
  SUPABASE_URL: emptyToUndefined(z.string().url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: emptyToUndefined(z.string().min(20).optional()),
  SUPABASE_STORAGE_BUCKET: z.string().default('TOMBOLA_RAFFLE_IMAGE'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),

  // SMS Gateway
  SMS_API_URL: emptyToUndefined(z.string().url().optional()),
  SMS_API_KEY: z.string().optional(),
  DEMO_OTP_ENABLED: z.string().default('false').transform((val) => val === 'true'),

  // Telegram Mini App + Login. Bot token and OIDC client ID must belong to
  // the same bot. Login remains disabled until these are configured.
  TELEGRAM_BOT_TOKEN: emptyToUndefined(z.string().min(20).optional()),
  TELEGRAM_CLIENT_ID: emptyToUndefined(z.string().regex(/^\d+$/).optional()),
  TELEGRAM_AUTH_MAX_AGE_SECONDS: z
    .string()
    .default('3600')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(60).max(3600)),
  // Verifies inbound POSTs to /auth/telegram/webhook actually came from
  // Telegram (sent back as the X-Telegram-Bot-Api-Secret-Token header on
  // every request once set via setWebhook) — without this, anyone who
  // learns the webhook URL could POST a forged "user shared this phone
  // number" update and hijack an account. Mini App auto-phone-capture
  // (no OTP inside the bot) stays disabled until this is configured.
  TELEGRAM_WEBHOOK_SECRET: emptyToUndefined(z.string().min(16).optional()),

  // Payment - Chapa
  CHAPA_SECRET_KEY: z.string().optional(),
  CHAPA_WEBHOOK_SECRET: z.string().optional(),

  // Mobile app origin — Chapa redirects the user's browser here (return_url)
  // after checkout, separate from CALLBACK_URL/webhook which is server-to-server.
  MOBILE_APP_URL: emptyToUndefined(z.string().url().default('http://localhost:4345')),

  // This API's own public origin — used to build absolute URLs it hands
  // back to callers (Chapa's webhook callback_url, uploaded image URLs).
  API_BASE_URL: emptyToUndefined(z.string().url().default('http://localhost:3435')),

  // Skip the real Chapa API and send checkout through a fake payment page
  // in the mobile app instead — for local testing without live merchant
  // credentials. That page still calls the real webhook, so the rest of
  // the flow (ticket issuance, payment status polling) is exercised for
  // real. Explicit opt-in, never on by default.
  MOCK_PAYMENTS: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),

  // Payment - Telebirr
  TELEBIRR_APP_ID: z.string().optional(),
  TELEBIRR_APP_KEY: z.string().optional(),

  // CORS
  CORS_ORIGINS: emptyToUndefined(
    z
      .string()
      .default('http://localhost:4345,http://localhost:5355')
      .transform((val) => val.split(','))
  ),

  // Server
  PORT: z
    .string()
    .default('3435')
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
