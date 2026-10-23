import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { and, eq, sql } from 'drizzle-orm';
import { orderRouter } from './order.controller.js';
import { config } from '../../infrastructure/config.js';
import { getDb } from '../../infrastructure/database/drizzle/client.js';
import {
  auditLogs,
  businessOrderCounters,
  businesses,
  categories,
  customers,
  orderItems,
  orderStatusHistory,
  orders,
  productVariants,
  products,
  users,
} from '../../infrastructure/database/drizzle/schema.js';
import { startPg, stopPg, resetDatabase } from '../../test-support/pg-test-database.js';

const app = express();
app.use(express.json());
app.use('/api/orders', orderRouter);

const BIZ = '00000000-0000-0000-0000-0000000000a1';
const OTHER_BIZ = '00000000-0000-0000-0000-0000000000b2';
const OWNER = '00000000-0000-0000-0000-0000000000c3';
const STAFF = '00000000-0000-0000-0000-0000000000d4';
const OUTSIDER = '00000000-0000-0000-0000-0000000000e5';
const BROKEN_ACTOR = 'not-a-uuid';

function tokenFor(
  userId: string,
  memberships: { businessId: string; role: 'OWNER' | 'STAFF' }[],
): string {
  return jwt.sign({ userId, memberships }, config.JWT_SECRET);
}

const OWNER_TOKEN = tokenFor(OWNER, [{ businessId: BIZ, role: 'OWNER' }]);
const STAFF_TOKEN = tokenFor(STAFF, [{ businessId: BIZ, role: 'STAFF' }]);
const OUTSIDER_TOKEN = tokenFor(OUTSIDER, [{ businessId: OTHER_BIZ, role: 'OWNER' }]);
const BROKEN_TOKEN = tokenFor(BROKEN_ACTOR, [{ businessId: BIZ, role: 'OWNER' }]);

function as(token: string, businessId = BIZ) {
  return { authorization: `Bearer ${token}`, 'x-business-id': businessId };
}

let phoneSeq = 0;
function nextPhone(): string {
  phoneSeq += 1;
  return `+88019${String(phoneSeq).padStart(8, '0')}`;
}

interface Fixtures {
  customerId: string;
  secondCustomerId: string;
  thirdCustomerId: string;
  otherCustomerId: string;
  simpleProductId: string;
  variantProductId: string;
  variantSId: string;
  variantMId: string;
  otherProductId: string;
}

let fixtures: Fixtures;

async function seedBusiness(businessId: string): Promise<void> {
  await getDb()
    .insert(businesses)
    .values({ id: businessId, name: `Business ${businessId}` });
}

async function seedUser(id: string, name: string): Promise<void> {
  await getDb()
    .insert(users)
    .values({ id, email: `${id}@example.com`, name });
}

async function seedCustomer(
  businessId: string,
  fields: { name: string; phone?: string; address?: string | null; archivedAt?: Date },
): Promise<string> {
  const rows = await getDb()
    .insert(customers)
    .values({
      businessId,
      name: fields.name,
      phone: fields.phone ?? nextPhone(),
      address: fields.address ?? null,
      archivedAt: fields.archivedAt ?? null,
    })
    .returning({ id: customers.id });
  return rows[0].id;
}

async function seedCategory(businessId: string, name: string): Promise<string> {
  const rows = await getDb()
    .insert(categories)
    .values({ businessId, name })
    .returning({ id: categories.id });
  return rows[0].id;
}

async function seedProduct(
  businessId: string,
  categoryId: string,
  fields: {
    name: string;
    price: number;
    cost?: number;
    isArchived?: boolean;
    options?: { name: string; values: string[] }[];
    variants?: { combination: Record<string, string>; price?: number; cost?: number }[];
  },
): Promise<{ id: string; variantIds: string[] }> {
  const rows = await getDb()
    .insert(products)
    .values({
      businessId,
      categoryId,
      name: fields.name,
      price: fields.price,
      cost: fields.cost ?? null,
      options: fields.options ?? [],
      isArchived: fields.isArchived ?? false,
      archivedAt: fields.isArchived ? new Date() : null,
    })
    .returning({ id: products.id });
  const productId = rows[0].id;

  const variantIds: string[] = [];
  for (const [position, variant] of (fields.variants ?? []).entries()) {
    const inserted = await getDb()
      .insert(productVariants)
      .values({
        businessId,
        productId,
        combination: variant.combination,
        price: variant.price ?? null,
        cost: variant.cost ?? null,
        position,
      })
      .returning({ id: productVariants.id });
    variantIds.push(inserted[0].id);
  }

  return { id: productId, variantIds };
}

async function seedFixtures(): Promise<void> {
  await seedBusiness(BIZ);
  await seedBusiness(OTHER_BIZ);
  await seedUser(OWNER, 'Maya Owner');
  await seedUser(STAFF, 'Sam Staff');

  const categoryId = await seedCategory(BIZ, 'Tops');
  const otherCategoryId = await seedCategory(OTHER_BIZ, 'Other tops');

  const customerId = await seedCustomer(BIZ, {
    name: 'Nusrat Jahan',
    phone: '+8801712345678',
    address: 'House 12, Road 5',
  });
  const secondCustomerId = await seedCustomer(BIZ, {
    name: 'Tanvir Ahmed',
    phone: '+8801812345678',
    address: 'Flat 3B, Gulshan',
  });
  const thirdCustomerId = await seedCustomer(BIZ, {
    name: 'Sadia Karim',
    phone: '+8801912345678',
  });
  const otherCustomerId = await seedCustomer(OTHER_BIZ, { name: 'Other Buyer' });

  const simple = await seedProduct(BIZ, categoryId, {
    name: 'Cotton shirt',
    price: 1000,
    cost: 600,
  });
  const variantProduct = await seedProduct(BIZ, categoryId, {
    name: 'Panjabi',
    price: 2000,
    cost: 1200,
    options: [{ name: 'Size', values: ['S', 'M'] }],
    variants: [
      { combination: { Size: 'S' }, price: 2500, cost: 1500 },
      { combination: { Size: 'M' }, price: 2800, cost: 1600 },
    ],
  });
  const other = await seedProduct(OTHER_BIZ, otherCategoryId, {
    name: 'Other product',
    price: 500,
  });

  fixtures = {
    customerId,
    secondCustomerId,
    thirdCustomerId,
    otherCustomerId,
    simpleProductId: simple.id,
    variantProductId: variantProduct.id,
    variantSId: variantProduct.variantIds[0],
    variantMId: variantProduct.variantIds[1],
    otherProductId: other.id,
  };
}

function createOrder(
  body: Record<string, unknown>,
  token = OWNER_TOKEN,
  idempotencyKey?: string,
  businessId = BIZ,
) {
  const call = request(app).post('/api/orders').set(as(token, businessId));
  if (idempotencyKey !== undefined) call.set('Idempotency-Key', idempotencyKey);
  return call.send(body);
}

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    customerId: fixtures.customerId,
    items: [{ productId: fixtures.simpleProductId, quantity: 1 }],
    source: 'FACEBOOK',
    ...overrides,
  };
}

async function countOrders(): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(orders);
  return Number(rows[0]?.count ?? 0);
}

async function findOrder(id: string) {
  const rows = await getDb().select().from(orders).where(eq(orders.id, id));
  return rows[0];
}

async function historyFor(id: string) {
  return getDb()
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, id))
    .orderBy(orderStatusHistory.createdAt);
}

async function auditRowsFor(id: string) {
  return getDb()
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.businessId, BIZ), eq(auditLogs.entityId, id)));
}

describe('order routes against PostgreSQL', () => {
  beforeAll(async () => {
    await startPg();
  }, 60_000);

  afterAll(async () => {
    await stopPg();
  }, 60_000);

  beforeEach(async () => {
    await resetDatabase();
    await seedFixtures();
  });

  describe('create and read (AC-1, AC-2, AC-3, AC-4, AC-8, AC-18)', () => {
    it('creates a numbered order with merged lines, snapshots, totals, history, and an audit row', async () => {
      const created = await createOrder(
        baseOrder({
          items: [
            { productId: fixtures.simpleProductId, quantity: 2, unitPrice: 900 },
            { productId: fixtures.variantProductId, variantId: fixtures.variantSId, quantity: 1 },
            { productId: fixtures.variantProductId, variantId: fixtures.variantSId, quantity: 2 },
          ],
          deliveryFee: 100,
          discount: 50,
          shippingAddress: '   ',
          notes: '  Call before delivery  ',
        }),
      );

      expect(created.status).toBe(201);
      const order = created.body.data;
      expect(order).toMatchObject({
        orderNumber: 'ORD-0001',
        status: 'PENDING',
        source: 'FACEBOOK',
        customerName: 'Nusrat Jahan',
        customerPhone: '+8801712345678',
        subtotal: 9300,
        deliveryFee: 100,
        discount: 50,
        total: 9350,
        paidAmount: 0,
        dueAmount: 9350,
        shippingAddress: null,
        notes: 'Call before delivery',
        version: 1,
      });
      expect(order.items).toHaveLength(2);
      expect(order.items[0]).toMatchObject({
        productId: fixtures.simpleProductId,
        variantId: null,
        productName: 'Cotton shirt',
        variantLabel: null,
        price: 900,
        cost: 600,
        quantity: 2,
        subtotal: 1800,
        position: 0,
      });
      expect(order.items[1]).toMatchObject({
        productId: fixtures.variantProductId,
        variantId: fixtures.variantSId,
        productName: 'Panjabi',
        variantLabel: 'S',
        price: 2500,
        cost: 1500,
        quantity: 3,
        subtotal: 7500,
        position: 1,
      });
      expect(order.history).toHaveLength(1);
      expect(order.history[0]).toMatchObject({
        fromStatus: null,
        toStatus: 'PENDING',
        note: null,
        changedByName: 'Maya Owner',
      });

      const detail = await request(app).get(`/api/orders/${order.id}`).set(as(OWNER_TOKEN));
      expect(detail.status).toBe(200);
      expect(detail.body.data).toEqual(order);

      const list = await request(app).get('/api/orders').set(as(OWNER_TOKEN));
      expect(list.status).toBe(200);
      expect(list.body.data.items).toHaveLength(1);
      expect(list.body.data.items[0]).toMatchObject({
        id: order.id,
        orderNumber: 'ORD-0001',
        customerName: 'Nusrat Jahan',
        status: 'PENDING',
        total: 9350,
        dueAmount: 9350,
        source: 'FACEBOOK',
        itemCount: 2,
      });

      const audits = await auditRowsFor(order.id);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        entityType: 'ORDER',
        action: 'ORDER_CREATED',
        userId: OWNER,
      });
      expect(JSON.parse(String(audits[0].metadata))).toEqual({
        orderNumber: 'ORD-0001',
        total: 9350,
      });

      const second = await createOrder(baseOrder({ customerId: fixtures.secondCustomerId }));
      expect(second.status).toBe(201);
      expect(second.body.data.orderNumber).toBe('ORD-0002');

      const otherBusiness = await createOrder(
        baseOrder({
          customerId: fixtures.otherCustomerId,
          items: [{ productId: fixtures.otherProductId, quantity: 1 }],
        }),
        OUTSIDER_TOKEN,
        undefined,
        OTHER_BIZ,
      );
      expect(otherBusiness.status).toBe(201);
      expect(otherBusiness.body.data.orderNumber).toBe('ORD-0001');
    });

    it('keeps snapshots when the customer and catalog change later', async () => {
      const created = await createOrder(
        baseOrder({
          items: [
            { productId: fixtures.simpleProductId, quantity: 2 },
            { productId: fixtures.variantProductId, variantId: fixtures.variantSId, quantity: 1 },
          ],
        }),
      );
      expect(created.status).toBe(201);

      await getDb()
        .update(customers)
        .set({ name: 'Renamed Buyer', phone: '+8801999999999' })
        .where(eq(customers.id, fixtures.customerId));
      await getDb()
        .update(products)
        .set({ name: 'Renamed shirt', price: 5000, cost: 4000 })
        .where(eq(products.id, fixtures.simpleProductId));

      const detail = await request(app)
        .get(`/api/orders/${created.body.data.id}`)
        .set(as(OWNER_TOKEN));
      expect(detail.status).toBe(200);
      expect(detail.body.data).toMatchObject({
        customerName: 'Nusrat Jahan',
        customerPhone: '+8801712345678',
      });
      expect(detail.body.data.items[0]).toMatchObject({
        productName: 'Cotton shirt',
        price: 1000,
        cost: 600,
      });
    });
  });

  describe('validation and references (AC-1, AC-11, AC-12, AC-13)', () => {
    it('rejects archived, unknown, cross tenant, conflicting, and out of range input without writing', async () => {
      await getDb()
        .update(customers)
        .set({ archivedAt: new Date() })
        .where(eq(customers.id, fixtures.customerId));
      const archivedCustomer = await createOrder(baseOrder());
      expect(archivedCustomer.status).toBe(409);
      expect(archivedCustomer.body.error).toBe('CUSTOMER_ARCHIVED');

      await getDb()
        .update(customers)
        .set({ archivedAt: null })
        .where(eq(customers.id, fixtures.customerId));
      await getDb()
        .update(products)
        .set({ isArchived: true, archivedAt: new Date() })
        .where(eq(products.id, fixtures.simpleProductId));
      const archivedProduct = await createOrder(baseOrder());
      expect(archivedProduct.status).toBe(400);
      expect(archivedProduct.body).toMatchObject({
        error: 'VALIDATION_ERROR',
        fields: ['items'],
      });

      await getDb()
        .update(products)
        .set({ isArchived: false, archivedAt: null })
        .where(eq(products.id, fixtures.simpleProductId));

      const unknownProduct = await createOrder(
        baseOrder({
          items: [{ productId: '00000000-0000-0000-0000-0000000000ff', quantity: 1 }],
        }),
      );
      expect(unknownProduct.status).toBe(400);
      expect(unknownProduct.body.fields).toEqual(['items']);

      const wrongVariant = await createOrder(
        baseOrder({
          items: [
            {
              productId: fixtures.simpleProductId,
              variantId: fixtures.variantSId,
              quantity: 1,
            },
          ],
        }),
      );
      expect(wrongVariant.status).toBe(400);
      expect(wrongVariant.body.fields).toEqual(['items']);

      const otherBusinessCustomer = await createOrder(
        baseOrder({ customerId: fixtures.otherCustomerId }),
      );
      expect(otherBusinessCustomer.status).toBe(400);
      expect(otherBusinessCustomer.body.fields).toEqual(['customerId']);

      const conflictingPrices = await createOrder(
        baseOrder({
          items: [
            { productId: fixtures.simpleProductId, quantity: 1, unitPrice: 100 },
            { productId: fixtures.simpleProductId, quantity: 1, unitPrice: 200 },
          ],
        }),
      );
      expect(conflictingPrices.status).toBe(400);
      expect(conflictingPrices.body.fields).toEqual(['items']);

      const mergedTooLarge = await createOrder(
        baseOrder({
          items: [
            { productId: fixtures.simpleProductId, quantity: 1000 },
            { productId: fixtures.simpleProductId, quantity: 1 },
          ],
        }),
      );
      expect(mergedTooLarge.status).toBe(400);
      expect(mergedTooLarge.body.fields).toEqual(['items']);

      const discountTooHigh = await createOrder(baseOrder({ discount: 1001 }));
      expect(discountTooHigh.status).toBe(400);
      expect(discountTooHigh.body.fields).toEqual(['discount']);

      const tooManyLines = await createOrder(
        baseOrder({
          items: Array.from({ length: 51 }, (_, index) => ({
            productId: fixtures.simpleProductId,
            quantity: 1,
            unitPrice: index + 1,
          })),
        }),
      );
      expect(tooManyLines.status).toBe(400);

      expect(await countOrders()).toBe(0);
    });

    it('accepts staff writes and rejects missing or foreign authentication', async () => {
      const staffOrder = await createOrder(baseOrder(), STAFF_TOKEN);
      expect(staffOrder.status).toBe(201);
      const orderId = staffOrder.body.data.id;

      const noToken = await request(app).get('/api/orders');
      expect(noToken.status).toBe(401);

      const noBusiness = await request(app)
        .get('/api/orders')
        .set({ authorization: `Bearer ${OWNER_TOKEN}` });
      expect(noBusiness.status).toBe(400);

      const outsider = await request(app).get('/api/orders').set(as(OUTSIDER_TOKEN, BIZ));
      expect(outsider.status).toBe(403);

      const foreignOrder = await request(app)
        .get(`/api/orders/${orderId}`)
        .set(as(OUTSIDER_TOKEN, OTHER_BIZ));
      expect(foreignOrder.status).toBe(404);

      const malformed = await request(app).get('/api/orders/not-a-uuid').set(as(OWNER_TOKEN));
      expect(malformed.status).toBe(404);
    });
  });

  describe('duplicates and idempotency (AC-5, AC-6, AC-15)', () => {
    it('warns on the same customer and item set, then honors the confirmation flag', async () => {
      const items = [
        { productId: fixtures.simpleProductId, quantity: 1 },
        { productId: fixtures.variantProductId, variantId: fixtures.variantSId, quantity: 1 },
      ];
      const first = await createOrder(baseOrder({ items }));
      expect(first.status).toBe(201);

      const duplicate = await createOrder(
        baseOrder({
          items: [
            { productId: fixtures.simpleProductId, quantity: 5 },
            { productId: fixtures.variantProductId, variantId: fixtures.variantSId, quantity: 7 },
          ],
        }),
      );
      expect(duplicate.status).toBe(409);
      expect(duplicate.body).toMatchObject({
        error: 'DUPLICATE_ORDER',
        existingOrder: {
          id: first.body.data.id,
          orderNumber: first.body.data.orderNumber,
          status: 'PENDING',
          total: first.body.data.total,
        },
      });

      const confirmed = await createOrder(baseOrder({ items, confirmDuplicate: true }));
      expect(confirmed.status).toBe(201);
      expect(confirmed.body.data.id).not.toBe(first.body.data.id);

      const differentItems = await createOrder(
        baseOrder({ items: [{ productId: fixtures.simpleProductId, quantity: 1 }] }),
      );
      expect(differentItems.status).toBe(201);

      const differentCustomer = await createOrder(
        baseOrder({ customerId: fixtures.secondCustomerId, items }),
      );
      expect(differentCustomer.status).toBe(201);

      const cancelFirst = await request(app)
        .post(`/api/orders/${first.body.data.id}/status`)
        .set(as(OWNER_TOKEN))
        .send({ status: 'CANCELLED', version: 1 });
      expect(cancelFirst.status).toBe(200);
      const cancelSecond = await request(app)
        .post(`/api/orders/${confirmed.body.data.id}/status`)
        .set(as(OWNER_TOKEN))
        .send({ status: 'CANCELLED', version: 1 });
      expect(cancelSecond.status).toBe(200);

      const afterCancel = await createOrder(baseOrder({ items }));
      expect(afterCancel.status).toBe(201);

      const oldOrder = await createOrder(
        baseOrder({
          customerId: fixtures.thirdCustomerId,
          items: [
            { productId: fixtures.variantProductId, variantId: fixtures.variantMId, quantity: 1 },
          ],
        }),
      );
      expect(oldOrder.status).toBe(201);
      await getDb()
        .update(orders)
        .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
        .where(eq(orders.id, oldOrder.body.data.id));

      const afterWindow = await createOrder(
        baseOrder({
          customerId: fixtures.thirdCustomerId,
          items: [
            { productId: fixtures.variantProductId, variantId: fixtures.variantMId, quantity: 1 },
          ],
        }),
      );
      expect(afterWindow.status).toBe(201);
    });

    it('replays an idempotency key before body checks and settles a race on one key', async () => {
      const key = 'order-key-1';
      const first = await createOrder(baseOrder({ notes: 'first' }), OWNER_TOKEN, key);
      expect(first.status).toBe(201);
      const orderId = first.body.data.id;

      const replay = await createOrder(
        baseOrder({ notes: 'a different payload' }),
        OWNER_TOKEN,
        key,
      );
      expect(replay.status).toBe(200);
      expect(replay.body.data.id).toBe(orderId);
      expect(replay.body.data.notes).toBe('first');

      const secondKey = await createOrder(
        baseOrder({ customerId: fixtures.secondCustomerId }),
        OWNER_TOKEN,
        'order-key-2',
      );
      expect(secondKey.status).toBe(201);
      expect(secondKey.body.data.id).not.toBe(orderId);

      const longKey = await createOrder(baseOrder(), OWNER_TOKEN, 'x'.repeat(101));
      expect(longKey.status).toBe(400);
      expect(longKey.body.fields).toEqual(['Idempotency-Key']);

      const raceBody = baseOrder({
        customerId: fixtures.thirdCustomerId,
        items: [
          { productId: fixtures.variantProductId, variantId: fixtures.variantMId, quantity: 2 },
        ],
        confirmDuplicate: true,
      });
      const [left, right] = await Promise.all([
        createOrder(raceBody, OWNER_TOKEN, 'race-key'),
        createOrder(raceBody, OWNER_TOKEN, 'race-key'),
      ]);
      expect(left.body.data.id).toBe(right.body.data.id);
      expect([left.status, right.status].sort()).toEqual([200, 201]);

      const rows = await getDb()
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(eq(orders.idempotencyKey, 'race-key'));
      expect(Number(rows[0].count)).toBe(1);
    });
  });

  describe('list, search, and cursor (AC-7)', () => {
    it('filters by status, searches snapshots and digits, escapes wildcards, and binds cursors', async () => {
      const first = await createOrder(
        baseOrder({
          customerId: fixtures.customerId,
          items: [{ productId: fixtures.simpleProductId, quantity: 1 }],
        }),
      );
      const second = await createOrder(
        baseOrder({
          customerId: fixtures.secondCustomerId,
          items: [
            { productId: fixtures.variantProductId, variantId: fixtures.variantSId, quantity: 1 },
          ],
        }),
      );
      const third = await createOrder(
        baseOrder({
          customerId: fixtures.thirdCustomerId,
          items: [
            { productId: fixtures.variantProductId, variantId: fixtures.variantMId, quantity: 1 },
          ],
        }),
      );
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(third.status).toBe(201);

      await request(app)
        .post(`/api/orders/${second.body.data.id}/status`)
        .set(as(OWNER_TOKEN))
        .send({ status: 'CONFIRMED', version: 1 });
      await request(app)
        .post(`/api/orders/${third.body.data.id}/status`)
        .set(as(OWNER_TOKEN))
        .send({ status: 'CANCELLED', version: 1 });

      const all = await request(app).get('/api/orders').set(as(OWNER_TOKEN));
      expect(all.status).toBe(200);
      expect(all.body.data.items.map((item: { id: string }) => item.id)).toEqual([
        third.body.data.id,
        second.body.data.id,
        first.body.data.id,
      ]);

      const confirmed = await request(app).get('/api/orders?status=CONFIRMED').set(as(OWNER_TOKEN));
      expect(confirmed.body.data.items.map((item: { id: string }) => item.id)).toEqual([
        second.body.data.id,
      ]);

      const twoStatuses = await request(app)
        .get('/api/orders?status=CONFIRMED,CANCELLED')
        .set(as(OWNER_TOKEN));
      expect(twoStatuses.body.data.items).toHaveLength(2);

      const byName = await request(app).get('/api/orders?q=nusrat').set(as(OWNER_TOKEN));
      expect(byName.body.data.items.map((item: { id: string }) => item.id)).toEqual([
        first.body.data.id,
      ]);

      const byNumber = await request(app)
        .get(`/api/orders?q=${encodeURIComponent('ORD-0002')}`)
        .set(as(OWNER_TOKEN));
      expect(byNumber.body.data.items.map((item: { id: string }) => item.id)).toEqual([
        second.body.data.id,
      ]);

      const byPhone = await request(app).get('/api/orders?q=181234').set(as(OWNER_TOKEN));
      expect(byPhone.body.data.items.map((item: { id: string }) => item.id)).toEqual([
        second.body.data.id,
      ]);

      const percentCustomer = await seedCustomer(BIZ, {
        name: 'Percent % Buyer',
        phone: '+8801555555555',
      });
      const percentProduct = await seedProduct(
        BIZ,
        (
          await getDb()
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.businessId, BIZ))
            .limit(1)
        )[0].id,
        { name: 'Percent product', price: 100 },
      );
      const percentOrder = await createOrder(
        baseOrder({
          customerId: percentCustomer,
          items: [{ productId: percentProduct.id, quantity: 1 }],
        }),
      );
      expect(percentOrder.status).toBe(201);

      const literalPercent = await request(app)
        .get(`/api/orders?q=${encodeURIComponent('%')}`)
        .set(as(OWNER_TOKEN));
      expect(literalPercent.body.data.items.map((item: { id: string }) => item.id)).toEqual([
        percentOrder.body.data.id,
      ]);

      const firstPage = await request(app).get('/api/orders?limit=1').set(as(OWNER_TOKEN));
      expect(firstPage.body.data.items).toHaveLength(1);
      expect(firstPage.body.data.nextCursor).toEqual(expect.any(String));

      const secondPage = await request(app)
        .get(`/api/orders?limit=1&cursor=${encodeURIComponent(firstPage.body.data.nextCursor)}`)
        .set(as(OWNER_TOKEN));
      expect(secondPage.status).toBe(200);
      expect(secondPage.body.data.items).toHaveLength(1);
      expect(secondPage.body.data.items[0].id).not.toBe(firstPage.body.data.items[0].id);

      const rebound = await request(app)
        .get(
          `/api/orders?status=CONFIRMED&limit=1&cursor=${encodeURIComponent(firstPage.body.data.nextCursor)}`,
        )
        .set(as(OWNER_TOKEN));
      expect(rebound.status).toBe(400);
      expect(rebound.body.fields).toEqual(['cursor']);

      for (const query of ['limit=0', 'limit=51', 'cursor=garbage']) {
        const invalid = await request(app).get(`/api/orders?${query}`).set(as(OWNER_TOKEN));
        expect(invalid.status).toBe(400);
      }

      await createOrder(
        baseOrder({
          customerId: fixtures.otherCustomerId,
          items: [{ productId: fixtures.otherProductId, quantity: 1 }],
        }),
        OUTSIDER_TOKEN,
        undefined,
        OTHER_BIZ,
      );
      const scoped = await request(app).get('/api/orders').set(as(OWNER_TOKEN));
      expect(
        scoped.body.data.items.every(
          (item: { customerName: string }) => item.customerName !== 'Other Buyer',
        ),
      ).toBe(true);
    });
  });

  describe('edit (AC-3, AC-9, AC-13, AC-17)', () => {
    it('updates lines by lineId, keeps snapshots, reorders, and writes one audit row', async () => {
      const created = await createOrder(
        baseOrder({
          items: [
            { productId: fixtures.simpleProductId, quantity: 2 },
            { productId: fixtures.variantProductId, variantId: fixtures.variantSId, quantity: 1 },
          ],
        }),
      );
      expect(created.status).toBe(201);
      const order = created.body.data;
      const simpleLineId = order.items[0].id;

      const edited = await request(app)
        .patch(`/api/orders/${order.id}`)
        .set(as(OWNER_TOKEN))
        .send({
          version: 1,
          customerId: fixtures.secondCustomerId,
          items: [
            {
              lineId: simpleLineId,
              productId: fixtures.simpleProductId,
              variantId: null,
              quantity: 3,
              unitPrice: 1100,
            },
            {
              productId: fixtures.variantProductId,
              variantId: fixtures.variantMId,
              quantity: 2,
            },
          ],
          deliveryFee: 200,
          discount: 100,
          shippingAddress: 'New address',
          notes: 'Updated notes',
        });

      expect(edited.status).toBe(200);
      const updated = edited.body.data;
      expect(updated).toMatchObject({
        customerName: 'Tanvir Ahmed',
        customerPhone: '+8801812345678',
        subtotal: 8900,
        deliveryFee: 200,
        discount: 100,
        total: 9000,
        dueAmount: 9000,
        version: 2,
        shippingAddress: 'New address',
        notes: 'Updated notes',
      });
      expect(updated.items).toHaveLength(2);
      expect(updated.items[0]).toMatchObject({
        id: simpleLineId,
        productName: 'Cotton shirt',
        price: 1100,
        cost: 600,
        quantity: 3,
        subtotal: 3300,
        position: 0,
      });
      expect(updated.items[1]).toMatchObject({
        productId: fixtures.variantProductId,
        variantId: fixtures.variantMId,
        productName: 'Panjabi',
        variantLabel: 'M',
        price: 2800,
        cost: 1600,
        quantity: 2,
        subtotal: 5600,
        position: 1,
      });
      expect(updated.history).toHaveLength(1);

      const audits = await auditRowsFor(order.id);
      const updateAudit = audits.find((row) => row.action === 'ORDER_UPDATED');
      expect(updateAudit).toBeDefined();
      expect(JSON.parse(String(updateAudit?.metadata))).toMatchObject({
        previousTotal: 4500,
        newTotal: 9000,
      });
      expect(JSON.parse(String(updateAudit?.metadata)).changedFields).toEqual(
        expect.arrayContaining([
          'customerId',
          'items',
          'deliveryFee',
          'discount',
          'shippingAddress',
          'notes',
        ]),
      );

      const noOp = await request(app)
        .patch(`/api/orders/${order.id}`)
        .set(as(OWNER_TOKEN))
        .send({
          version: 2,
          customerId: fixtures.secondCustomerId,
          items: [
            {
              lineId: updated.items[0].id,
              productId: fixtures.simpleProductId,
              variantId: null,
              quantity: 3,
              unitPrice: 1100,
            },
            {
              lineId: updated.items[1].id,
              productId: fixtures.variantProductId,
              variantId: fixtures.variantMId,
              quantity: 2,
              unitPrice: 2800,
            },
          ],
          deliveryFee: 200,
          discount: 100,
          shippingAddress: 'New address',
          notes: 'Updated notes',
        });
      expect(noOp.status).toBe(200);
      expect(noOp.body.data.version).toBe(2);
      expect(
        (await auditRowsFor(order.id)).filter((row) => row.action === 'ORDER_UPDATED'),
      ).toHaveLength(1);

      const stale = await request(app)
        .patch(`/api/orders/${order.id}`)
        .set(as(OWNER_TOKEN))
        .send({ version: 1, notes: 'stale' });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toBe('ORDER_CHANGED');
    });

    it('validates line identity and accepts archived references only for existing lines', async () => {
      const created = await createOrder(
        baseOrder({
          items: [
            { productId: fixtures.simpleProductId, quantity: 1 },
            { productId: fixtures.variantProductId, variantId: fixtures.variantSId, quantity: 1 },
          ],
        }),
      );
      const order = created.body.data;
      const simpleLine = order.items[0];
      const variantLine = order.items[1];

      const unknownLine = await request(app)
        .patch(`/api/orders/${order.id}`)
        .set(as(OWNER_TOKEN))
        .send({
          version: 1,
          items: [
            {
              lineId: '00000000-0000-0000-0000-0000000000ff',
              productId: fixtures.simpleProductId,
              quantity: 1,
            },
          ],
        });
      expect(unknownLine.status).toBe(400);
      expect(unknownLine.body.fields).toEqual(['items']);

      const repeated = await request(app)
        .patch(`/api/orders/${order.id}`)
        .set(as(OWNER_TOKEN))
        .send({
          version: 1,
          items: [
            {
              lineId: simpleLine.id,
              productId: fixtures.simpleProductId,
              quantity: 1,
            },
            {
              lineId: simpleLine.id,
              productId: fixtures.simpleProductId,
              quantity: 2,
            },
          ],
        });
      expect(repeated.status).toBe(400);
      expect(repeated.body.fields).toEqual(['items']);

      const mismatched = await request(app)
        .patch(`/api/orders/${order.id}`)
        .set(as(OWNER_TOKEN))
        .send({
          version: 1,
          items: [
            {
              lineId: simpleLine.id,
              productId: fixtures.variantProductId,
              variantId: fixtures.variantSId,
              quantity: 1,
            },
          ],
        });
      expect(mismatched.status).toBe(400);
      expect(mismatched.body.fields).toEqual(['items']);

      await getDb()
        .update(products)
        .set({ isArchived: true, archivedAt: new Date() })
        .where(eq(products.id, fixtures.simpleProductId));

      const archivedExisting = await request(app)
        .patch(`/api/orders/${order.id}`)
        .set(as(OWNER_TOKEN))
        .send({
          version: 1,
          items: [
            {
              lineId: simpleLine.id,
              productId: fixtures.simpleProductId,
              quantity: 4,
            },
            {
              lineId: variantLine.id,
              productId: fixtures.variantProductId,
              variantId: fixtures.variantSId,
              quantity: 1,
            },
          ],
        });
      expect(archivedExisting.status).toBe(200);
      expect(archivedExisting.body.data.version).toBe(2);
      expect(archivedExisting.body.data.items[0]).toMatchObject({
        productName: 'Cotton shirt',
        quantity: 4,
      });

      const archivedNew = await request(app)
        .patch(`/api/orders/${order.id}`)
        .set(as(OWNER_TOKEN))
        .send({
          version: 2,
          items: [
            {
              lineId: simpleLine.id,
              productId: fixtures.simpleProductId,
              quantity: 4,
            },
            {
              lineId: variantLine.id,
              productId: fixtures.variantProductId,
              variantId: fixtures.variantSId,
              quantity: 1,
            },
            { productId: fixtures.simpleProductId, quantity: 1 },
          ],
        });
      expect(archivedNew.status).toBe(400);
      expect(archivedNew.body.fields).toEqual(['items']);

      await getDb().delete(productVariants).where(eq(productVariants.id, fixtures.variantSId));

      const afterVariantDelete = await request(app)
        .get(`/api/orders/${order.id}`)
        .set(as(OWNER_TOKEN));
      expect(afterVariantDelete.status).toBe(200);
      const deletedLine = afterVariantDelete.body.data.items.find(
        (item: { id: string }) => item.id === variantLine.id,
      );
      expect(deletedLine).toMatchObject({
        variantId: null,
        variantLabel: 'S',
        productName: 'Panjabi',
        cost: 1500,
      });

      const editDeletedVariant = await request(app)
        .patch(`/api/orders/${order.id}`)
        .set(as(OWNER_TOKEN))
        .send({
          version: 2,
          items: [
            {
              lineId: simpleLine.id,
              productId: fixtures.simpleProductId,
              quantity: 4,
            },
            {
              lineId: variantLine.id,
              productId: fixtures.variantProductId,
              variantId: null,
              quantity: 2,
              unitPrice: 2500,
            },
          ],
        });
      expect(editDeletedVariant.status).toBe(200);
      expect(editDeletedVariant.body.data.version).toBe(3);
      expect(
        editDeletedVariant.body.data.items.find(
          (item: { id: string }) => item.id === variantLine.id,
        ),
      ).toMatchObject({ variantLabel: 'S', quantity: 2, price: 2500 });
    });

    it('locks edits after shipping and reports the status lock before the version check', async () => {
      const created = await createOrder(baseOrder());
      const orderId = created.body.data.id;

      for (const [status, version] of [
        ['CONFIRMED', 1],
        ['PROCESSING', 2],
        ['SHIPPED', 3],
      ] as const) {
        const moved = await request(app)
          .post(`/api/orders/${orderId}/status`)
          .set(as(OWNER_TOKEN))
          .send({ status, version });
        expect(moved.status).toBe(200);
      }

      const locked = await request(app)
        .patch(`/api/orders/${orderId}`)
        .set(as(OWNER_TOKEN))
        .send({ version: 1, notes: 'too late' });
      expect(locked.status).toBe(409);
      expect(locked.body.error).toBe('ORDER_LOCKED');
    });
  });

  describe('status workflow (AC-10, AC-18)', () => {
    it('walks the allowed path, records actors and notes, and rejects invalid moves', async () => {
      const created = await createOrder(
        baseOrder({ items: [{ productId: fixtures.simpleProductId, quantity: 2 }] }),
      );
      const orderId = created.body.data.id;
      const total = created.body.data.total;

      const confirmed = await request(app)
        .post(`/api/orders/${orderId}/status`)
        .set(as(OWNER_TOKEN))
        .send({ status: 'CONFIRMED', version: 1, note: 'Payment confirmed' });
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.data).toMatchObject({ status: 'CONFIRMED', version: 2, total });

      await getDb().update(users).set({ name: 'Maya Renamed' }).where(eq(users.id, OWNER));

      const invalid = await request(app)
        .post(`/api/orders/${orderId}/status`)
        .set(as(OWNER_TOKEN))
        .send({ status: 'DELIVERED', version: 2 });
      expect(invalid.status).toBe(409);
      expect(invalid.body.error).toBe('INVALID_STATUS_TRANSITION');

      const stale = await request(app)
        .post(`/api/orders/${orderId}/status`)
        .set(as(OWNER_TOKEN))
        .send({ status: 'PROCESSING', version: 1 });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toBe('ORDER_CHANGED');

      let version = 2;
      for (const status of ['PROCESSING', 'SHIPPED', 'DELIVERED', 'RETURNED'] as const) {
        const moved = await request(app)
          .post(`/api/orders/${orderId}/status`)
          .set(as(OWNER_TOKEN))
          .send({ status, version });
        expect(moved.status).toBe(200);
        version += 1;
      }

      const detail = await request(app).get(`/api/orders/${orderId}`).set(as(OWNER_TOKEN));
      expect(detail.body.data).toMatchObject({ status: 'RETURNED', version: 6, total });
      expect(detail.body.data.history).toHaveLength(6);
      expect(detail.body.data.history[1]).toMatchObject({
        fromStatus: 'PENDING',
        toStatus: 'CONFIRMED',
        note: 'Payment confirmed',
        changedByName: 'Maya Owner',
      });
      expect(detail.body.data.history[2]).toMatchObject({ changedByName: 'Maya Renamed' });

      const closed = await request(app)
        .post(`/api/orders/${orderId}/status`)
        .set(as(OWNER_TOKEN))
        .send({ status: 'PENDING', version: 6 });
      expect(closed.status).toBe(409);
      expect(closed.body.error).toBe('INVALID_STATUS_TRANSITION');

      const second = await createOrder(baseOrder({ customerId: fixtures.secondCustomerId }));
      const cancelled = await request(app)
        .post(`/api/orders/${second.body.data.id}/status`)
        .set(as(OWNER_TOKEN))
        .send({ status: 'CANCELLED', version: 1 });
      expect(cancelled.status).toBe(200);

      const afterCancel = await request(app)
        .post(`/api/orders/${second.body.data.id}/status`)
        .set(as(OWNER_TOKEN))
        .send({ status: 'CONFIRMED', version: 2 });
      expect(afterCancel.status).toBe(409);
      expect(afterCancel.body.error).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('atomicity (AC-17)', () => {
    it('rolls back the counter, order, lines, history, and audit when a create fails', async () => {
      const failed = await createOrder(baseOrder(), BROKEN_TOKEN);
      expect(failed.status).toBe(500);
      expect(await countOrders()).toBe(0);

      const counters = await getDb()
        .select({ count: sql<number>`count(*)::int` })
        .from(businessOrderCounters);
      expect(Number(counters[0].count)).toBe(0);

      const items = await getDb()
        .select({ count: sql<number>`count(*)::int` })
        .from(orderItems);
      expect(Number(items[0].count)).toBe(0);
      const history = await getDb()
        .select({ count: sql<number>`count(*)::int` })
        .from(orderStatusHistory);
      expect(Number(history[0].count)).toBe(0);
      const audits = await getDb()
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLogs);
      expect(Number(audits[0].count)).toBe(0);
    });

    it('rolls back an edit and a status change when the audit actor cannot be recorded', async () => {
      const created = await createOrder(baseOrder());
      const orderId = created.body.data.id;
      const auditsBefore = await auditRowsFor(orderId);

      const failedEdit = await request(app)
        .patch(`/api/orders/${orderId}`)
        .set(as(BROKEN_TOKEN))
        .send({ version: 1, notes: 'must not stick' });
      expect(failedEdit.status).toBe(500);

      const afterEdit = await findOrder(orderId);
      expect(afterEdit).toMatchObject({ notes: null, version: 1 });
      expect(await auditRowsFor(orderId)).toHaveLength(auditsBefore.length);

      const failedStatus = await request(app)
        .post(`/api/orders/${orderId}/status`)
        .set(as(BROKEN_TOKEN))
        .send({ status: 'CONFIRMED', version: 1 });
      expect(failedStatus.status).toBe(500);

      const afterStatus = await findOrder(orderId);
      expect(afterStatus).toMatchObject({ status: 'PENDING', version: 1 });
      expect(await historyFor(orderId)).toHaveLength(1);
      expect(await auditRowsFor(orderId)).toHaveLength(auditsBefore.length);
    });
  });
});
