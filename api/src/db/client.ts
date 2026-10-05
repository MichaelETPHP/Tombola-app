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
  connection: {
    // Every table lives in this schema (see Migration/001_first_schema.sql)
    // rather than the default `public` — set it per-connection so all of
    // this app's unqualified queries resolve against it.
    search_path: `"${env.DB_SCHEMA}", public`,
  },
  transform: {
    // `to` runs on outgoing JS keys (camelCase -> snake_case, e.g. sql(obj)
    // inserts); `from` runs on incoming DB column names (snake_case ->
    // camelCase, e.g. SELECT result rows). These were swapped, which left
    // every multi-word column (prize_name, ticket_cap, deadline_at, ...)
    // on the raw snake_case key instead of the camelCase one every service
    // layer reads (raffle.prizeName etc) — so those always came back
    // undefined while single-word columns (id, title, status) happened to
    // match either way and masked the bug.
    column: {
      to: postgres.fromCamel,
      from: postgres.toCamel,
    },
  },
});

/**
 * Graceful shutdown — close the connection pool.
 */
export async function closeDb(): Promise<void> {
  await sql.end();
}
