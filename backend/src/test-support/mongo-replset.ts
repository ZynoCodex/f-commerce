import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { CustomerModel } from '../infrastructure/database/mongoose/models/Customer.js';
import { OrderModel } from '../infrastructure/database/mongoose/models/Order.js';
import { AuditLogModel } from '../infrastructure/database/mongoose/models/AuditLog.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

/**
 * mongodb-memory-server resolves its binary cache relative to the cwd, which is
 * `backend/` under vitest, so the repo root cache is missed and the launch falls
 * back to a download that times out. Look the cached mongod up explicitly so the
 * replica set tests run offline from any working directory.
 */
function findSystemBinary(): string | undefined {
  const candidates: string[] = [];
  const configured = process.env.MONGOMS_SYSTEM_BINARY;
  if (configured) {
    candidates.push(path.resolve(REPO_ROOT, configured), path.resolve(configured));
  }
  const cacheDir = path.join(REPO_ROOT, 'node_modules', '.cache', 'mongodb-memory-server');
  try {
    for (const entry of fs.readdirSync(cacheDir)) {
      if (entry.startsWith('mongod') && !entry.endsWith('.md5')) {
        candidates.push(path.join(cacheDir, entry));
      }
    }
  } catch {
    // No cache directory: leave the binary unset so the normal download path runs.
  }
  return candidates.find((candidate) => fs.existsSync(candidate));
}

/** Start a single-node replica set so multi-document transactions are available. */
export async function startReplSet(): Promise<MongoMemoryReplSet> {
  const systemBinary = findSystemBinary();
  const replSet = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60_000 }],
    replSet: { count: 1 },
    ...(systemBinary ? { binary: { systemBinary } } : {}),
  });
  await mongoose.connect(replSet.getUri());
  return replSet;
}

export async function stopReplSet(replSet: MongoMemoryReplSet): Promise<void> {
  await mongoose.disconnect();
  await replSet.stop();
}

/** Drop all data, then rebuild the customer, order, and audit indexes the tests rely on. */
export async function resetDatabase(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection is not open');
  await db.dropDatabase();
  await Promise.all([
    CustomerModel.syncIndexes(),
    OrderModel.syncIndexes(),
    AuditLogModel.syncIndexes(),
  ]);
}
