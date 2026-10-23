import { and, eq, ne, isNull, or, desc, asc, lt, gt, sql, notInArray } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { getDb } from '../client.js';
import { customers, orders, auditLogs } from '../schema.js';
import { getTenantId } from '../context.js';
import { isUuid } from '../../../../domain/uuid.js';
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

/** Escape LIKE metacharacters so a prefix search treats them literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function toCustomer(row: typeof customers.$inferSelect): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? undefined,
    address: row.address ?? undefined,
    notes: row.notes ?? undefined,
    archivedAt: row.archivedAt ?? undefined,
    version: row.version,
    businessId: row.businessId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toOrder(row: typeof orders.$inferSelect): Order {
  return {
    id: row.id,
    customerId: row.customerId,
    orderNumber: row.orderNumber,
    status: row.status,
    customerNameSnapshot: row.customerNameSnapshot,
    customerPhoneSnapshot: row.customerPhoneSnapshot,
    subtotal: row.subtotal,
    deliveryFee: row.deliveryFee,
    discount: row.discount,
    total: row.total,
    paidAmount: row.paidAmount,
    dueAmount: row.dueAmount,
    shippingAddress: row.shippingAddress ?? undefined,
    courierId: row.courierId ?? undefined,
    trackingNumber: row.trackingNumber ?? undefined,
    source: row.source ?? undefined,
    notes: row.notes ?? undefined,
    idempotencyKey: row.idempotencyKey ?? undefined,
    version: row.version,
    businessId: row.businessId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleCustomerRepository implements ICustomerRepository {
  async findById(id: string): Promise<Customer | null> {
    const businessId = getTenantId();
    if (!businessId || !isUuid(id)) return null;

    const result = await getDb()
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.businessId, businessId)));
    if (result.length === 0) return null;
    return toCustomer(result[0]);
  }

  async findByPhone(phone: string, excludeId?: string): Promise<Customer | null> {
    const businessId = getTenantId();
    if (!businessId) return null;

    const conditions = [eq(customers.phone, phone), eq(customers.businessId, businessId)];
    if (excludeId && isUuid(excludeId)) {
      conditions.push(ne(customers.id, excludeId));
    }

    const result = await getDb()
      .select()
      .from(customers)
      .where(and(...conditions));
    if (result.length === 0) return null;
    return toCustomer(result[0]);
  }

  async findLiveByPhone(phone: string): Promise<Customer | null> {
    const businessId = getTenantId();
    if (!businessId) return null;

    const result = await getDb()
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.businessId, businessId),
          eq(customers.phone, phone),
          isNull(customers.archivedAt),
        ),
      );
    if (result.length === 0) return null;
    return toCustomer(result[0]);
  }

  async insert(data: Customer): Promise<Customer> {
    const businessId = getTenantId() ?? data.businessId;
    const now = new Date();

    const result = await getDb()
      .insert(customers)
      .values({
        businessId,
        name: data.name,
        phone: data.phone,
        email: data.email ?? null,
        address: data.address ?? null,
        notes: data.notes ?? null,
        version: data.version,
        createdAt: data.createdAt ?? now,
        updatedAt: data.updatedAt ?? now,
      })
      .returning();

    if (result.length === 0) {
      throw new Error('Failed to insert customer');
    }
    return toCustomer(result[0]);
  }

  async update(
    id: string,
    expectedVersion: number,
    changes: CustomerUpdateData,
    nextVersion: number,
  ): Promise<Customer | null> {
    const businessId = getTenantId();
    if (!businessId || !isUuid(id)) return null;

    const setParams: Record<string, unknown> = { version: nextVersion, updatedAt: new Date() };
    for (const [field, value] of Object.entries(changes)) {
      if (value === null) {
        setParams[field] = null;
      } else if (value !== undefined) {
        setParams[field] = value;
      }
    }

    const result = await getDb()
      .update(customers)
      .set(setParams)
      .where(
        and(
          eq(customers.id, id),
          eq(customers.businessId, businessId),
          eq(customers.version, expectedVersion),
        ),
      )
      .returning();

    if (result.length === 0) return null;
    return toCustomer(result[0]);
  }

  async search(query: CustomerSearchQuery): Promise<CustomerSearchResult> {
    const businessId = getTenantId();
    if (!businessId) {
      return { items: [], hasMore: false };
    }

    const conditions = [eq(customers.businessId, businessId), isNull(customers.archivedAt)];

    const orConditions: SQL[] = [];
    if (query.nameQuery !== '') {
      // Case-insensitive prefix match on the name; lower() keeps it aligned
      // with the lower(name) sort and functional index.
      orConditions.push(
        sql`lower(${customers.name}) LIKE lower(${escapeLike(query.nameQuery)}) || '%'`,
      );
    }
    if (query.phonePrefix !== null) {
      orConditions.push(sql`${customers.phone} LIKE ${escapeLike(query.phonePrefix) + '%'}`);
    }
    if (orConditions.length > 0) {
      const combined = or(...orConditions);
      if (combined) conditions.push(combined);
    }

    if (query.name !== undefined && query.id !== undefined && isUuid(query.id)) {
      const cursorCondition = or(
        sql`lower(${customers.name}) > lower(${query.name})`,
        and(sql`lower(${customers.name}) = lower(${query.name})`, gt(customers.id, query.id)),
      );
      if (cursorCondition) conditions.push(cursorCondition);
    }

    const result = await getDb()
      .select()
      .from(customers)
      .where(and(...conditions))
      .orderBy(sql`lower(${customers.name}) asc`, asc(customers.id))
      .limit(query.limit + 1);

    const hasMore = result.length > query.limit;
    const items = (hasMore ? result.slice(0, query.limit) : result).map(toCustomer);
    return { items, hasMore };
  }

  async listOrders(query: CustomerOrderQuery): Promise<CustomerOrderResult> {
    const businessId = getTenantId();
    if (!businessId || !isUuid(query.customerId)) {
      return { items: [], hasMore: false };
    }

    const conditions = [eq(orders.customerId, query.customerId), eq(orders.businessId, businessId)];

    if (query.createdAt !== undefined && query.id !== undefined && isUuid(query.id)) {
      const cursorCondition = or(
        lt(orders.createdAt, query.createdAt),
        and(eq(orders.createdAt, query.createdAt), lt(orders.id, query.id)),
      );
      if (cursorCondition) conditions.push(cursorCondition);
    }

    const result = await getDb()
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(query.limit + 1);

    const hasMore = result.length > query.limit;
    const items = (hasMore ? result.slice(0, query.limit) : result).map(toOrder);
    return { items, hasMore };
  }

  async aggregateSpend(
    customerId: string,
    excludedStatuses: OrderStatus[],
  ): Promise<CustomerSpendSummary> {
    const businessId = getTenantId();
    if (!businessId || !isUuid(customerId)) {
      return { orderCount: 0, totalSpent: 0, totalDue: 0 };
    }

    const conditions = [
      eq(orders.customerId, customerId),
      eq(orders.businessId, businessId),
      excludedStatuses.length > 0 ? notInArray(orders.status, excludedStatuses) : undefined,
    ];

    const result = await getDb()
      .select({
        orderCount: sql<number>`count(*)`,
        totalSpent: sql<number>`coalesce(sum(${orders.total}), 0)`,
        totalDue: sql<number>`coalesce(sum(${orders.dueAmount}), 0)`,
      })
      .from(orders)
      .where(and(...conditions));

    if (result.length === 0) {
      return { orderCount: 0, totalSpent: 0, totalDue: 0 };
    }
    const row = result[0];
    return {
      orderCount: Number(row.orderCount),
      totalSpent: Number(row.totalSpent),
      totalDue: Number(row.totalDue),
    };
  }

  async archiveWithAudit(
    id: string,
    expectedVersion: number,
    audit: CustomerAuditEntry,
  ): Promise<Customer | null> {
    return this.applyTransition(id, expectedVersion, audit, (now) => ({
      version: expectedVersion + 1,
      archivedAt: now,
      updatedAt: now,
    }));
  }

  async restoreWithAudit(
    id: string,
    expectedVersion: number,
    audit: CustomerAuditEntry,
  ): Promise<Customer | null> {
    return this.applyTransition(id, expectedVersion, audit, (now) => ({
      version: expectedVersion + 1,
      archivedAt: null,
      updatedAt: now,
    }));
  }

  /**
   * Apply an archive or restore and write its audit entry in one transaction,
   * so a failure in either write leaves neither committed.
   */
  private async applyTransition(
    id: string,
    expectedVersion: number,
    audit: CustomerAuditEntry,
    buildChanges: (now: Date) => Partial<typeof customers.$inferInsert>,
  ): Promise<Customer | null> {
    const businessId = getTenantId();
    if (!businessId || !isUuid(id)) return null;

    return await getDb().transaction(async (tx) => {
      const now = new Date();
      const updated = await tx
        .update(customers)
        .set(buildChanges(now))
        .where(
          and(
            eq(customers.id, id),
            eq(customers.businessId, businessId),
            eq(customers.version, expectedVersion),
          ),
        )
        .returning();

      if (updated.length === 0) return null;

      await tx.insert(auditLogs).values({
        businessId: audit.businessId,
        userId: audit.userId,
        action: audit.action,
        entityType: audit.entityType,
        entityId: audit.entityId,
      });

      return toCustomer(updated[0]);
    });
  }
}
