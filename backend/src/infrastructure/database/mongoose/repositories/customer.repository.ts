import mongoose from 'mongoose';
import { CustomerModel } from '../models/Customer.js';
import { OrderModel } from '../models/Order.js';
import { AuditLogModel } from '../models/AuditLog.js';
import { Customer } from '../../../../domain/entities/customer.entity.js';
import { Order, OrderStatus } from '../../../../domain/entities/order.entity.js';
import {
  CustomerAuditEntry,
  CustomerOrderQuery,
  CustomerOrderResult,
  CustomerSearchQuery,
  CustomerSearchResult,
  CustomerSpendSummary,
  CustomerUpdateData,
  ICustomerRepository,
} from '../../../../domain/repositories/customer.repository.js';

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const NAME_COLLATION = { locale: 'en', strength: 2 } as const;

/** Sentinel thrown inside a transition to abort the transaction on a stale version. */
const STALE_VERSION = Symbol('stale-version');

/** Quote a string so it can be embedded in a regular expression literally. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function objectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

function toCustomer(doc: Record<string, unknown>): Customer {
  return {
    id: (doc._id as mongoose.Types.ObjectId).toString(),
    name: doc.name as string,
    phone: doc.phone as string,
    email: (doc.email as string | undefined) ?? undefined,
    address: (doc.address as string | undefined) ?? undefined,
    notes: (doc.notes as string | undefined) ?? undefined,
    archivedAt: (doc.archivedAt as Date | undefined) ?? undefined,
    version: doc.version as number,
    businessId: (doc.businessId as mongoose.Types.ObjectId).toString(),
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
}

function toOrder(doc: Record<string, unknown>): Order {
  return {
    id: (doc._id as mongoose.Types.ObjectId).toString(),
    customerId: (doc.customerId as mongoose.Types.ObjectId).toString(),
    orderNumber: doc.orderNumber as string,
    status: doc.status as OrderStatus,
    subtotal: doc.subtotal as number,
    deliveryFee: doc.deliveryFee as number,
    discount: doc.discount as number,
    total: doc.total as number,
    paidAmount: doc.paidAmount as number,
    dueAmount: doc.dueAmount as number,
    shippingAddress: doc.shippingAddress as string | undefined,
    courierId: doc.courierId ? (doc.courierId as mongoose.Types.ObjectId).toString() : undefined,
    trackingNumber: doc.trackingNumber as string | undefined,
    source: doc.source as string | undefined,
    notes: doc.notes as string | undefined,
    idempotencyKey: doc.idempotencyKey as string | undefined,
    businessId: (doc.businessId as mongoose.Types.ObjectId).toString(),
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
}

export class MongooseCustomerRepository implements ICustomerRepository {
  async findById(id: string): Promise<Customer | null> {
    if (!OBJECT_ID_PATTERN.test(id)) return null;
    const doc = await CustomerModel.findById(id).lean<Record<string, unknown>>();
    return doc ? toCustomer(doc) : null;
  }

  async findByPhone(phone: string, excludeId?: string): Promise<Customer | null> {
    const filter: Record<string, unknown> = { phone };
    if (excludeId && OBJECT_ID_PATTERN.test(excludeId)) {
      filter._id = { $ne: objectId(excludeId) };
    }
    const doc = await CustomerModel.findOne(filter).lean<Record<string, unknown>>();
    return doc ? toCustomer(doc) : null;
  }

  async findLiveByPhone(phone: string): Promise<Customer | null> {
    const doc = await CustomerModel.findOne({ phone, archivedAt: null }).lean<
      Record<string, unknown>
    >();
    return doc ? toCustomer(doc) : null;
  }

  async insert(data: Customer): Promise<Customer> {
    const doc = await CustomerModel.create({
      name: data.name,
      phone: data.phone,
      email: data.email,
      address: data.address,
      notes: data.notes,
      version: data.version,
    });
    return toCustomer(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(
    id: string,
    expectedVersion: number,
    changes: CustomerUpdateData,
    nextVersion: number,
  ): Promise<Customer | null> {
    if (!OBJECT_ID_PATTERN.test(id)) return null;

    const set: Record<string, unknown> = { version: nextVersion };
    const unset: Record<string, string> = {};

    for (const [field, value] of Object.entries(changes)) {
      if (value === null) {
        unset[field] = '';
      } else if (value !== undefined) {
        set[field] = value;
      }
    }

    const update: Record<string, unknown> = { $set: set };
    if (Object.keys(unset).length > 0) update.$unset = unset;

    const doc = await CustomerModel.findOneAndUpdate(
      { _id: objectId(id), version: expectedVersion },
      update,
      { new: true },
    ).lean<Record<string, unknown>>();

    return doc ? toCustomer(doc) : null;
  }

  async search(query: CustomerSearchQuery): Promise<CustomerSearchResult> {
    const conditions: Record<string, unknown>[] = [{ archivedAt: null }];

    const or: Record<string, unknown>[] = [];
    if (query.nameQuery !== '') {
      // Case insensitivity comes from the index collation, so the pattern stays
      // anchored and the index remains usable.
      or.push({ name: { $regex: `^${escapeRegex(query.nameQuery)}` } });
    }
    if (query.phonePrefix !== null) {
      or.push({ phone: { $regex: `^${escapeRegex(query.phonePrefix)}` } });
    }
    if (or.length > 0) {
      conditions.push(or.length === 1 ? or[0] : { $or: or });
    }

    if (query.name !== undefined && query.id !== undefined) {
      conditions.push({
        $or: [
          { name: { $gt: query.name } },
          { name: query.name, _id: { $gt: objectId(query.id) } },
        ],
      });
    }

    const docs = await CustomerModel.find({ $and: conditions })
      .collation(NAME_COLLATION)
      .sort({ name: 1, _id: 1 })
      .limit(query.limit + 1)
      .lean<Record<string, unknown>[]>();

    const hasMore = docs.length > query.limit;
    const items = (hasMore ? docs.slice(0, query.limit) : docs).map(toCustomer);
    return { items, hasMore };
  }

  async listOrders(query: CustomerOrderQuery): Promise<CustomerOrderResult> {
    const filter: Record<string, unknown> = { customerId: objectId(query.customerId) };

    if (query.createdAt !== undefined && query.id !== undefined) {
      filter.$or = [
        { createdAt: { $lt: query.createdAt } },
        { createdAt: query.createdAt, _id: { $lt: objectId(query.id) } },
      ];
    }

    const docs = await OrderModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(query.limit + 1)
      .lean<Record<string, unknown>[]>();

    const hasMore = docs.length > query.limit;
    const items = (hasMore ? docs.slice(0, query.limit) : docs).map(toOrder);
    return { items, hasMore };
  }

  async aggregateSpend(
    customerId: string,
    excludedStatuses: OrderStatus[],
  ): Promise<CustomerSpendSummary> {
    const rows = await OrderModel.aggregate<{
      orderCount: number;
      totalSpent: number;
      totalDue: number;
    }>([
      {
        $match: {
          customerId: objectId(customerId),
          status: { $nin: excludedStatuses },
        },
      },
      {
        $group: {
          _id: null,
          orderCount: { $sum: 1 },
          totalSpent: { $sum: '$total' },
          totalDue: { $sum: '$dueAmount' },
        },
      },
    ]);

    const row = rows[0];
    return {
      orderCount: row?.orderCount ?? 0,
      totalSpent: row?.totalSpent ?? 0,
      totalDue: row?.totalDue ?? 0,
    };
  }

  async archiveWithAudit(
    id: string,
    expectedVersion: number,
    audit: CustomerAuditEntry,
  ): Promise<Customer | null> {
    return this.applyTransition(id, expectedVersion, audit, {
      $set: { archivedAt: new Date(), version: expectedVersion + 1 },
    });
  }

  async restoreWithAudit(
    id: string,
    expectedVersion: number,
    audit: CustomerAuditEntry,
  ): Promise<Customer | null> {
    return this.applyTransition(id, expectedVersion, audit, {
      $set: { version: expectedVersion + 1 },
      $unset: { archivedAt: '' },
    });
  }

  /**
   * Apply an archive or restore and write its audit entry in one transaction,
   * so a failure in either write leaves neither committed.
   */
  private async applyTransition(
    id: string,
    expectedVersion: number,
    audit: CustomerAuditEntry,
    update: Record<string, unknown>,
  ): Promise<Customer | null> {
    if (!OBJECT_ID_PATTERN.test(id)) return null;

    let updated: Customer | null = null;
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        const doc = await CustomerModel.findOneAndUpdate(
          { _id: objectId(id), version: expectedVersion },
          update,
          { new: true, session },
        ).lean<Record<string, unknown>>();

        if (!doc) {
          // Version no longer matches: abort so no audit entry is written.
          throw STALE_VERSION;
        }

        updated = toCustomer(doc);

        await AuditLogModel.create(
          [
            {
              userId: objectId(audit.userId),
              action: audit.action,
              entityType: audit.entityType,
              entityId: audit.entityId,
              businessId: objectId(audit.businessId),
            },
          ],
          { session },
        );
      });

      return updated;
    } catch (error) {
      if (error === STALE_VERSION) return null;
      throw error;
    } finally {
      await session.endSession();
    }
  }
}