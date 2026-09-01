import { sql } from '../db/client.js';
import { env } from '../config/env.js';

export type CheckStatus = 'ok' | 'degraded' | 'error';

export interface CheckResult {
  status: CheckStatus;
  latencyMs?: number;
  message?: string;
  detail?: Record<string, unknown>;
}

export interface HealthReport {
  status: CheckStatus;           // worst of all individual checks
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    database: CheckResult;
    memory: CheckResult;
    config: CheckResult;
  };
}

// ─── Individual Checks ────────────────────────────────────────────

/**
 * Pings the PostgreSQL database with a lightweight round-trip query.
 * Returns latency in milliseconds and the DB server version string.
 */
async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const rows = await sql<{ now: string; version: string }[]>`
      SELECT NOW() AS now, current_setting('server_version') AS version
    `;
    const latencyMs = Date.now() - start;
    const row = rows[0];

    // Warn if latency is high but still reachable
    const status: CheckStatus = latencyMs > 2000 ? 'degraded' : 'ok';

    return {
      status,
      latencyMs,
      message: status === 'degraded'
        ? `DB responded but slowly (${latencyMs}ms)`
        : 'Database is reachable',
      detail: {
        serverTime: row?.now,
        postgresVersion: row?.version,
        schema: env.DB_SCHEMA,
      },
    };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Unknown DB error',
    };
  }
}

/**
 * Reports Node/Bun heap memory usage.
 * Flags 'degraded' above 500 MB, 'error' above 1.5 GB.
 */
function checkMemory(): CheckResult {
  const mem = process.memoryUsage();
  const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMb = Math.round(mem.rss / 1024 / 1024);

  let status: CheckStatus = 'ok';
  if (heapUsedMb > 1500) status = 'error';
  else if (heapUsedMb > 500) status = 'degraded';

  return {
    status,
    message: `Heap: ${heapUsedMb} MB used / ${heapTotalMb} MB total — RSS: ${rssMb} MB`,
    detail: {
      heapUsedMb,
      heapTotalMb,
      rssMb,
      externalMb: Math.round((mem.external ?? 0) / 1024 / 1024),
    },
  };
}

/**
 * Validates that critical env vars are properly set (not just the
 * placeholder values that come from .env.example).
 */
function checkConfig(): CheckResult {
  const issues: string[] = [];

  if (env.JWT_ACCESS_SECRET === 'your-access-secret-here')
    issues.push('JWT_ACCESS_SECRET is still the placeholder value');
  if (env.JWT_REFRESH_SECRET === 'your-refresh-secret-here')
    issues.push('JWT_REFRESH_SECRET is still the placeholder value');
  if (!env.DATABASE_URL || env.DATABASE_URL.includes('[PASSWORD]'))
    issues.push('DATABASE_URL is missing or still a template');

  // API_BASE_URL/MOBILE_APP_URL both default to localhost for local dev
  // convenience — but that default is silently wrong in production. Every
  // uploaded-image URL is built from API_BASE_URL at upload time and baked
  // into the database permanently; if this defaults to localhost in
  // production, every image any admin uploads becomes unreachable for
  // every visitor except someone on that exact machine, with no error
  // anywhere in the flow to surface it. Same failure shape for
  // MOBILE_APP_URL and the Chapa checkout return_url it builds.
  if (env.NODE_ENV === 'production') {
    if (/^https?:\/\/localhost(:|\/|$)/.test(env.API_BASE_URL))
      issues.push('API_BASE_URL is still localhost in production — every uploaded image URL will be broken for everyone');
    if (/^https?:\/\/localhost(:|\/|$)/.test(env.MOBILE_APP_URL))
      issues.push('MOBILE_APP_URL is still localhost in production — Chapa checkout return_url will be broken for everyone');
    // MOCK_PAYMENTS=true in production (pre-launch, no real Chapa
    // credentials yet) is legitimate, but the webhook still requires a
    // real Chapa signature unless MOCK_PAYMENTS_SECRET is also set — see
    // payments.routes.ts. Without it, mock-checkout's confirmation is
    // rejected with 401 and every single checkout attempt fails.
    if (env.MOCK_PAYMENTS && !env.MOCK_PAYMENTS_SECRET)
      issues.push('MOCK_PAYMENTS=true in production but MOCK_PAYMENTS_SECRET is unset — every checkout attempt will fail with a rejected confirmation');
  }

  const warnings: string[] = [];
  if (!env.SMS_API_URL)
    warnings.push('SMS_API_URL not set — OTP will be logged to console (dev mode)');
  if (env.MOCK_PAYMENTS)
    warnings.push('MOCK_PAYMENTS=true — Chapa payments are simulated');
  if (env.DEMO_OTP_ENABLED)
    warnings.push('DEMO_OTP_ENABLED=true — code 123456 bypasses real SMS');

  const status: CheckStatus =
    issues.length > 0 ? 'error' : warnings.length > 0 ? 'degraded' : 'ok';

  return {
    status,
    message: issues.length > 0
      ? `${issues.length} critical config error(s)`
      : warnings.length > 0
        ? `${warnings.length} warning(s) — check detail`
        : 'All required config is present',
    detail: {
      errors: issues,
      warnings,
      mockPayments: env.MOCK_PAYMENTS,
      demoOtpEnabled: env.DEMO_OTP_ENABLED,
      smsConfigured: !!env.SMS_API_URL,
      corsOrigins: env.CORS_ORIGINS,
    },
  };
}

// ─── Aggregate ────────────────────────────────────────────────────

/**
 * Runs all health checks in parallel and returns a structured report.
 * The top-level `status` is the worst status across all checks:
 *   ok < degraded < error
 */
export async function runHealthChecks(): Promise<HealthReport> {
  const [database, memory, config] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkMemory()),
    Promise.resolve(checkConfig()),
  ]);

  const statuses: CheckStatus[] = [database.status, memory.status, config.status];
  const overallStatus: CheckStatus =
    statuses.includes('error')    ? 'error'    :
    statuses.includes('degraded') ? 'degraded' : 'ok';

  return {
    status: overallStatus,
    version: '1.0.0',
    environment: env.NODE_ENV,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: { database, memory, config },
  };
}
