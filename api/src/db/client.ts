import postgres from 'postgres';
import { env } from '../config/env.js';

/**
 * postgres.js client connected to Supabase PostgreSQL.
 * Uses connection pooling with sensible defaults for a Bun runtime.
 */
export const sql = postgres(env.DATABASE_URL, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
  transform: {
    // Convert snake_case column names to camelCase in results
    column: {
      to: postgres.toCamel,
      from: postgres.fromCamel,
    },
  },
});

/**
 * Graceful shutdown — close the connection pool.
 */
export async function closeDb(): Promise<void> {
  await sql.end();
}
