import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongooseCustomerRepository } from './customer.repository.js';
import { CustomerModel } from '../models/Customer.js';
import { OrderModel } from '../models/Order.js';
import { AuditLogModel } from '../models/AuditLog.js';
import { runWithContext } from '../context.js';
import { OrderStatus } from '../../../../domain/entities/order.entity.js';
import {
  startReplSet,
  stopReplSet,
  resetDatabase,
} from '../../../../test-support/mongo-replset.js';

const BIZ_A = new mongoose.Types.ObjectId().toString();
const BIZ_B = new mongoose.Types.ObjectId().toString();
const USER = new mongoose.Types.ObjectId().toString();

const AUDIT_ARCHIVE = {
  businessId: BIZ_A,
  userId: USER,
  action: 'CUSTOMER_ARCHIVED',
  entityType: 'CUSTOMER',
  entityId: '',
};

let phoneSeq = 0;
function nextPhone(): string {
  phoneSeq += 1;
  return `+88017${String(phoneSeq).padStart(8, '0')}`;
}

/** Run a callback inside a business's tenant context, awaiting it before the scope ends. */
function inBusiness<T>(businessId: string, fn: () => Promise<T> | T): Promise<T> {
  return runWithContext({ userId: USER, businessId, role: 'OWNER' }, async () => await fn());
}

function auditCount(filter: Record<string, unknown>): Promise<number> {
  return inBusiness(BIZ_A, () => AuditLogModel.countDocuments(filter));
}

async function seedCustomer(
  businessId: string,
  name: string,
  extra: { phone?: string; archivedAt?: Date } = {},
): Promise<string> {
  return inBusiness(businessId, async () => {
    const doc = await CustomerModel.create({
      businessId: new mongoose.Types.ObjectId(businessId),
      name,
      phone: extra.phone ?? nextPhone(),
      archivedAt: extra.archivedAt,
      version: 1,
    });
    return doc._id.toString();
  });
}

async function seedOrder(
  businessId: string,
  customerId: string,
  fields: {
    orderNumber: string;
    total: number;
    dueAmount: number;
    status?: OrderStatus;
    createdAt?: Date;
  },
): Promise<string> {
  return inBusiness(businessId, async () => {
    const doc = await OrderModel.create({
      businessId: new mongoose.Types.ObjectId(businessId),
      customerId: new mongoose.Types.ObjectId(customerId),
      orderNumber: fields.orderNumber,
      status: fields.status ?? OrderStatus.PENDING,
      subtotal: fields.total,
      deliveryFee: 0,
      discount: 0,
      total: fields.total,
      paidAmount: fields.total - fields.dueAmount,
      dueAmount: fields.dueAmount,
    });
    if (fields.createdAt) {
      await OrderModel.collection.updateOne(
        { _id: doc._id },
        { $set: { createdAt: fields.createdAt } },
      );
    }
    return doc._id.toString();
  });
}

/** Collect every value stored under a key anywhere in an explain tree. */
function collectValues(node: unknown, key: string): string[] {
  if (typeof node !== 'object' || node === null) return [];
  const found: string[] = [];
  for (const [entryKey, value] of Object.entries(node)) {
    if (entryKey === key && typeof value === 'string') found.push(value);
    found.push(...collectValues(value, key));
  }
  return found;
}

function winningPlanOf(explain: unknown): unknown {
  return (explain as { queryPlanner: { winningPlan: unknown } }).queryPlanner.winningPlan;
}

describe('MongooseCustomerRepository against a replica set', () => {
  let replSet: MongoMemoryReplSet;
  const repo = new MongooseCustomerRepository();

  beforeAll(async () => {
    replSet = await startReplSet();
  }, 120_000);

  afterAll(async () => {
    await stopReplSet(replSet);
  }, 120_000);

  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('tenant isolation (AC-11)', () => {
    it('does not return a customer that belongs to another business', async () => {
      const id = await seedCustomer(BIZ_A, 'Rahim');

      const found = await inBusiness(BIZ_B, () => repo.findById(id));

      expect(found).toBeNull();
    });
  });

  describe('phone uniqueness (AC-2, AC-3)', () => {
    it('rejects a second customer with the same phone in one business', async () => {
      const phone = '+8801712345678';
      await seedCustomer(BIZ_A, 'Rahim', { phone });

      await expect(seedCustomer(BIZ_A, 'Karim', { phone })).rejects.toMatchObject({
        code: 11000,
      });
    });

    it('allows the same phone in a different business', async () => {
      const phone = '+8801712345678';
      await seedCustomer(BIZ_A, 'Rahim', { phone });

      await expect(seedCustomer(BIZ_B, 'Karim', { phone })).resolves.toEqual(expect.any(String));
    });
  });

  describe('archive and restore transactions (AC-8, AC-10)', () => {
    it('commits the archive and exactly one audit entry together', async () => {
      const id = await seedCustomer(BIZ_A, 'Rahim');

      const updated = await inBusiness(BIZ_A, () =>
        repo.archiveWithAudit(id, 1, { ...AUDIT_ARCHIVE, entityId: id }),
      );

      expect(updated?.version).toBe(2);
      expect(updated?.archivedAt).toBeInstanceOf(Date);
      const audits = await inBusiness(BIZ_A, () => AuditLogModel.find({ entityId: id }).lean());
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        action: 'CUSTOMER_ARCHIVED',
        entityType: 'CUSTOMER',
        userId: new mongoose.Types.ObjectId(USER),
      });
    });

    it('rolls back the archive when the audit insert fails', async () => {
      const id = await seedCustomer(BIZ_A, 'Rahim');
      vi.spyOn(AuditLogModel, 'create').mockRejectedValueOnce(new Error('audit write failed'));

      await expect(
        inBusiness(BIZ_A, () => repo.archiveWithAudit(id, 1, { ...AUDIT_ARCHIVE, entityId: id })),
      ).rejects.toThrow('audit write failed');

      const stored = await inBusiness(BIZ_A, () => repo.findById(id));
      expect(stored?.archivedAt).toBeUndefined();
      expect(stored?.version).toBe(1);
      expect(await auditCount({ entityId: id })).toBe(0);
    });

    it('rolls back the restore when the audit insert fails', async () => {
      const id = await seedCustomer(BIZ_A, 'Rahim', { archivedAt: new Date() });
      vi.spyOn(AuditLogModel, 'create').mockRejectedValueOnce(new Error('audit write failed'));

      await expect(
        inBusiness(BIZ_A, () =>
          repo.restoreWithAudit(id, 1, {
            ...AUDIT_ARCHIVE,
            action: 'CUSTOMER_RESTORED',
            entityId: id,
          }),
        ),
      ).rejects.toThrow('audit write failed');

      const stored = await inBusiness(BIZ_A, () => repo.findById(id));
      expect(stored?.archivedAt).toBeInstanceOf(Date);
      expect(stored?.version).toBe(1);
      expect(await auditCount({ entityId: id })).toBe(0);
    });

    it('lets only one of two concurrent archives with the same version succeed', async () => {
      const id = await seedCustomer(BIZ_A, 'Rahim');
      const audit = { ...AUDIT_ARCHIVE, entityId: id };

      const results = await inBusiness(BIZ_A, () =>
        Promise.all([repo.archiveWithAudit(id, 1, audit), repo.archiveWithAudit(id, 1, audit)]),
      );

      expect(results.filter((result) => result !== null)).toHaveLength(1);
      expect(await auditCount({ entityId: id })).toBe(1);
    });

    it('restores an archived customer, clears archivedAt, and writes one audit entry', async () => {
      const id = await seedCustomer(BIZ_A, 'Rahim', { archivedAt: new Date() });

      const restored = await inBusiness(BIZ_A, () =>
        repo.restoreWithAudit(id, 1, {
          ...AUDIT_ARCHIVE,
          action: 'CUSTOMER_RESTORED',
          entityId: id,
        }),
      );

      expect(restored?.archivedAt).toBeUndefined();
      expect(restored?.version).toBe(2);
      expect(await auditCount({ entityId: id, action: 'CUSTOMER_RESTORED' })).toBe(1);
    });
  });

  describe('version guard on edits (AC-4)', () => {
    it('changes nothing when the version is stale', async () => {
      const id = await seedCustomer(BIZ_A, 'Rahim');

      const result = await inBusiness(BIZ_A, () => repo.update(id, 2, { name: 'Karim' }, 3));

      expect(result).toBeNull();
      const stored = await inBusiness(BIZ_A, () => repo.findById(id));
      expect(stored?.name).toBe('Rahim');
      expect(stored?.version).toBe(1);
    });

    it('raises the version by exactly one on a matching write', async () => {
      const id = await seedCustomer(BIZ_A, 'Rahim');

      const result = await inBusiness(BIZ_A, () => repo.update(id, 1, { name: 'Karim' }, 2));

      expect(result?.name).toBe('Karim');
      expect(result?.version).toBe(2);
    });

    it('clears an optional field when the change is null', async () => {
      const id = await seedCustomer(BIZ_A, 'Rahim');
      await inBusiness(BIZ_A, () => repo.update(id, 1, { email: 'rahim@example.com' }, 2));

      const result = await inBusiness(BIZ_A, () => repo.update(id, 2, { email: null }, 3));

      expect(result?.email).toBeUndefined();
      expect(result?.version).toBe(3);
    });
  });

  describe('search (AC-5)', () => {
    it('matches names by prefix ignoring case, skips archived customers, and sorts by name', async () => {
      await seedCustomer(BIZ_A, 'Anika');
      await seedCustomer(BIZ_A, 'anwar');
      await seedCustomer(BIZ_A, 'Babul');
      await seedCustomer(BIZ_A, 'Ananya');
      await seedCustomer(BIZ_A, 'Ali', { archivedAt: new Date() });

      const page = await inBusiness(BIZ_A, () =>
        repo.search({ nameQuery: 'a', phonePrefix: null, limit: 10 }),
      );

      expect(page.items.map((item) => item.name)).toEqual(['Ananya', 'Anika', 'anwar']);
      expect(page.hasMore).toBe(false);
    });

    it('matches phone prefixes and skips archived customers', async () => {
      await seedCustomer(BIZ_A, 'Anika', { phone: '+8801700000001' });
      await seedCustomer(BIZ_A, 'Babul', { phone: '+8801700000002' });
      await seedCustomer(BIZ_A, 'Chadni', { phone: '+8801900000003' });
      await seedCustomer(BIZ_A, 'Dilip', {
        phone: '+8801700000004',
        archivedAt: new Date(),
      });

      const page = await inBusiness(BIZ_A, () =>
        repo.search({ nameQuery: '', phonePrefix: '+880170', limit: 10 }),
      );

      expect(page.items.map((item) => item.name)).toEqual(['Anika', 'Babul']);
    });

    it('pages from a name and id anchor and reports hasMore', async () => {
      await seedCustomer(BIZ_A, 'Anika');
      await seedCustomer(BIZ_A, 'Babul');
      await seedCustomer(BIZ_A, 'Chadni');

      const first = await inBusiness(BIZ_A, () =>
        repo.search({ nameQuery: '', phonePrefix: null, limit: 2 }),
      );
      expect(first.items.map((item) => item.name)).toEqual(['Anika', 'Babul']);
      expect(first.hasMore).toBe(true);

      const last = first.items[first.items.length - 1];
      const second = await inBusiness(BIZ_A, () =>
        repo.search({
          nameQuery: '',
          phonePrefix: null,
          limit: 2,
          name: last.name,
          id: last.id,
        }),
      );
      expect(second.items.map((item) => item.name)).toEqual(['Chadni']);
      expect(second.hasMore).toBe(false);
    });
  });

  describe('order history and spend (AC-6, AC-7, AC-12)', () => {
    it('lists orders newest first and pages from a createdAt and id anchor', async () => {
      const customerId = await seedCustomer(BIZ_A, 'Rahim');
      const oldest = await seedOrder(BIZ_A, customerId, {
        orderNumber: 'ORD-1',
        total: 100,
        dueAmount: 100,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      const middle = await seedOrder(BIZ_A, customerId, {
        orderNumber: 'ORD-2',
        total: 200,
        dueAmount: 0,
        createdAt: new Date('2026-02-01T00:00:00Z'),
      });
      const newest = await seedOrder(BIZ_A, customerId, {
        orderNumber: 'ORD-3',
        total: 300,
        dueAmount: 300,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      });

      const first = await inBusiness(BIZ_A, () => repo.listOrders({ customerId, limit: 2 }));
      expect(first.items.map((order) => order.id)).toEqual([newest, middle]);
      expect(first.hasMore).toBe(true);

      const last = first.items[first.items.length - 1];
      const second = await inBusiness(BIZ_A, () =>
        repo.listOrders({ customerId, limit: 2, createdAt: last.createdAt, id: last.id }),
      );
      expect(second.items.map((order) => order.id)).toEqual([oldest]);
      expect(second.hasMore).toBe(false);
    });

    it('excludes cancelled and returned orders from spend totals', async () => {
      const customerId = await seedCustomer(BIZ_A, 'Rahim');
      await seedOrder(BIZ_A, customerId, { orderNumber: 'ORD-1', total: 500, dueAmount: 100 });
      await seedOrder(BIZ_A, customerId, { orderNumber: 'ORD-2', total: 300, dueAmount: 300 });
      await seedOrder(BIZ_A, customerId, {
        orderNumber: 'ORD-3',
        total: 200,
        dueAmount: 200,
        status: OrderStatus.CANCELLED,
      });
      await seedOrder(BIZ_A, customerId, {
        orderNumber: 'ORD-4',
        total: 400,
        dueAmount: 0,
        status: OrderStatus.RETURNED,
      });

      const spend = await inBusiness(BIZ_A, () =>
        repo.aggregateSpend(customerId, [OrderStatus.CANCELLED, OrderStatus.RETURNED]),
      );

      expect(spend).toEqual({ orderCount: 2, totalSpent: 800, totalDue: 400 });
    });

    it('keeps an order without a customerId out of history and totals', async () => {
      const customerId = await seedCustomer(BIZ_A, 'Rahim');
      await seedOrder(BIZ_A, customerId, { orderNumber: 'ORD-1', total: 250, dueAmount: 50 });
      await OrderModel.collection.insertOne({
        businessId: new mongoose.Types.ObjectId(BIZ_A),
        orderNumber: 'LEGACY-1',
        status: OrderStatus.DELIVERED,
        subtotal: 999,
        deliveryFee: 0,
        discount: 0,
        total: 999,
        paidAmount: 0,
        dueAmount: 999,
        createdAt: new Date(),
      });

      const history = await inBusiness(BIZ_A, () => repo.listOrders({ customerId, limit: 20 }));
      const spend = await inBusiness(BIZ_A, () =>
        repo.aggregateSpend(customerId, [OrderStatus.CANCELLED, OrderStatus.RETURNED]),
      );

      expect(history.items.map((order) => order.orderNumber)).toEqual(['ORD-1']);
      expect(spend).toEqual({ orderCount: 1, totalSpent: 250, totalDue: 50 });
    });
  });

  describe('index plans (AC-5, AC-7)', () => {
    it('serves name search from the business and name index', async () => {
      for (let i = 0; i < 30; i += 1) {
        await seedCustomer(BIZ_A, `Buyer ${String(i).padStart(2, '0')}`);
      }

      const plan = await inBusiness(BIZ_A, () =>
        CustomerModel.find({
          businessId: new mongoose.Types.ObjectId(BIZ_A),
          archivedAt: null,
          name: { $gte: 'buyer', $lt: 'buyer￿' },
        })
          .collation({ locale: 'en', strength: 2 })
          .sort({ name: 1, _id: 1 })
          .explain('queryPlanner'),
      );

      expect(collectValues(winningPlanOf(plan), 'indexName')).toContain('businessId_1_name_1');
    });

    it('serves order history from the business, customer, and createdAt index', async () => {
      const customerId = await seedCustomer(BIZ_A, 'Rahim');
      for (let i = 0; i < 30; i += 1) {
        await seedOrder(BIZ_A, customerId, {
          orderNumber: `ORD-${i}`,
          total: 10,
          dueAmount: 0,
          createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
        });
      }

      const plan = await inBusiness(BIZ_A, () =>
        OrderModel.find({
          businessId: new mongoose.Types.ObjectId(BIZ_A),
          customerId: new mongoose.Types.ObjectId(customerId),
        })
          .sort({ createdAt: -1, _id: -1 })
          .explain('queryPlanner'),
      );

      expect(collectValues(winningPlanOf(plan), 'indexName')).toContain(
        'businessId_1_customerId_1_createdAt_-1',
      );
    });
  });
});
