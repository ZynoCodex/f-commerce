import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { CustomerModel } from '../infrastructure/database/mongoose/models/Customer.js';
import { OrderModel } from '../infrastructure/database/mongoose/models/Order.js';
import { AuditLogModel } from '../infrastructure/database/mongoose/models/AuditLog.js';

/** Start a single-node replica set so multi-document transactions are available. */
export async function startReplSet(): Promise<MongoMemoryReplSet> {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
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
