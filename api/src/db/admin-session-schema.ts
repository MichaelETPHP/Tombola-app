import type { Sql, TransactionSql } from 'postgres';
import { env } from '../config/env.js';
import { sql } from './client.js';

type SchemaQuery = Sql | TransactionSql;
interface SessionColumn { dataType: string; isNullable: string; columnDefault: string | null }

export async function inspectAdminSessionSchema(query: SchemaQuery = sql) {
  const [column] = await query<SessionColumn[]>`
    SELECT data_type, is_nullable, column_default FROM information_schema.columns
    WHERE table_schema = ${env.DB_SCHEMA} AND table_name = 'admin_users'
      AND column_name = 'session_version'
  `;
  return {
    exists: Boolean(column),
    ready: column?.dataType === 'integer' && column.isNullable === 'NO'
      && /^(?:\(?0\)?)(?:::integer)?$/.test(column.columnDefault ?? ''),
  };
}

/** Migration 018 only. Never resets existing session versions or alters other tables. */
export async function applyAdminSessionMigration(): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`SET LOCAL lock_timeout = '5s'`;
    await tx`SET LOCAL statement_timeout = '15s'`;
    // Serializes concurrent deploys; all schema changes remain transactional.
    await tx`SELECT pg_advisory_xact_lock(hashtext(current_database()), hashtext(${env.DB_SCHEMA + '.admin-session-018'}))`;
    if (!(await inspectAdminSessionSchema(tx)).exists) {
      // The client's camelCase transform also rewrites identifier helpers.
      // Quote the configured schema explicitly to preserve case, escaping quotes.
      const schemaIdentifier = '"' + env.DB_SCHEMA.replaceAll('"', '""') + '"';
      await tx.unsafe(`ALTER TABLE ${schemaIdentifier}.admin_users
        ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0`);
    }
    if (!(await inspectAdminSessionSchema(tx)).ready) {
      throw new Error('Existing admin session column is incompatible. No changes were committed; review migration 018 with the database owner.');
    }
  });
}

// The explicit apply command is a deployment step, never an HTTP endpoint.
if (import.meta.main) {
  const mode = process.argv[2];
  try {
    if (mode !== '--check' && mode !== '--apply') throw new Error('Use --check or --apply.');
    if (mode === '--apply') await applyAdminSessionMigration();
    const state = await inspectAdminSessionSchema();
    console.log(JSON.stringify({ schema: env.DB_SCHEMA, apiOrigin: new URL(env.API_BASE_URL).origin, ...state }));
    if (!state.ready) process.exitCode = 1;
  } catch (error) {
    // Connection strings and database credentials must never appear in CLI output.
    const code = error && typeof error === 'object' && 'code' in error ? error.code : 'SCHEMA_NOT_READY';
    console.error(code === '42501'
      ? 'The database role cannot alter admin_users. Have the database owner apply migration 018.'
      : 'Admin session schema check/migration failed.', { code });
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}
