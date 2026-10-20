import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { config } from '../../config.js';
import * as schema from './schema.js';

export type DbType = NodePgDatabase<typeof schema>;

let pool: Pool | null = null;
let db: DbType | null = null;
let testDb: DbType | null = null;

function createDb(): DbType {
  // TLS travels with the URL (?sslmode=require and friends); pg reads the mode
  // from the connection string, so no extra pool options are needed here.
  pool = new Pool({ connectionString: config.DATABASE_URL });
  return drizzle(pool, { schema });
}

/**
 * The active database handle. Tests replace it with an isolated database via
 * `setTestDb`, otherwise the application pool is created on first use.
 */
export function getDb(): DbType {
  if (testDb) return testDb;
  if (!db) db = createDb();
  return db;
}

/** Probe the database so startup fails loudly when it is unreachable. */
export async function verifyDatabaseConnection(): Promise<void> {
  await getDb().execute(sql`select 1`);
}

/** Close the application pool. Used by tests and graceful shutdown. */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  db = null;
}

export function setTestDb(testDatabase: DbType): void {
  testDb = testDatabase;
}

export function resetTestDb(): void {
  testDb = null;
}

export { schema };
