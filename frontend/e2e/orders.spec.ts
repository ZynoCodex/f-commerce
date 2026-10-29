import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// E2E for the orders flow (spec 0007).
// Requires the dev stack: backend on :4000, frontend on :3000, PostgreSQL running.
// Start the backend with RATE_LIMIT_DISABLED=true as CI does, otherwise the
// register limiter caps how many accounts a run can create.
// Run with: npm run e2e --workspace @f-commerce/frontend -- e2e/orders.spec.ts

test.use({ baseURL: 'http://localhost:3000' });

const password = 'password123';

async function signUpOwner(apiRequest: APIRequestContext, timezone = 'Asia/Dhaka') {
  const email = `order-${randomUUID().slice(0, 8)}@example.com`;
  const res = await apiRequest.post('/api/auth/register', {
    data: { email, password, name: 'Owner', businessName: 'Orders E2E Co' },
  });
  const data = await res.json();
  const payload = JSON.parse(Buffer.from(data.accessToken.split('.')[1], 'base64').toString());
  const accessToken: string = data.accessToken;
  const businessId: string = payload.memberships?.[0]?.businessId ?? data.businessId;

  await apiRequest.put('/api/business/onboarding', {
    data: {
      name: 'Orders E2E Co',
      currency: 'USD',
      timezone,
      address: { street: '1 E2E Street', city: 'Dhaka', country: 'Bangladesh' },
    },
    headers: { Authorization: `Bearer ${accessToken}`, 'x-business-id': businessId },
  });

  return { accessToken, businessId };
}

function as(token: string, businessId: string) {
  return { Authorization: `Bearer ${token}`, 'x-business-id': businessId };
}

async function setAuthState(page: Page, token: string, businessId: string) {
  await page.addInitScript(
    (auth) => {
      window.localStorage.setItem('accessToken', auth.accessToken);
      window.localStorage.setItem('businessId', auth.businessId);
    },
    { accessToken: token, businessId },
  );
}

interface SeededCatalog {
  customerId: string;
  customerName: string;
  productId: string;
  productName: string;
}

async function seedCatalogAndCustomer(
  apiRequest: APIRequestContext,
  token: string,
  businessId: string,
): Promise<SeededCatalog> {
  const headers = as(token, businessId);
  const suffix = randomUUID().slice(0, 8);

  const categoryRes = await apiRequest.post('/api/categories', {
    data: { name: `E2E Tops ${suffix}` },
    headers,
  });
  expect(categoryRes.ok()).toBe(true);
  const categoryId = (await categoryRes.json()).data.id as string;

  const productRes = await apiRequest.post('/api/products', {
    data: {
      name: 'E2E Cotton Tee',
      categoryId,
      sku: `E2E-${suffix}`,
      price: 1200,
      stockCount: 25,
    },
    headers,
  });
  expect(productRes.ok()).toBe(true);
  const productId = (await productRes.json()).data.id as string;

  const digits = randomUUID().replace(/\D/g, '').slice(0, 8).padStart(8, '9');
  const customerRes = await apiRequest.post('/api/customers', {
    data: {
      name: 'Order Buyer',
      phone: `+8801${digits}`,
      address: '12 Buyer Road\nDhaka',
    },
    headers,
  });
  expect(customerRes.ok()).toBe(true);
  const customerId = (await customerRes.json()).data.id as string;

  return { customerId, customerName: 'Order Buyer', productId, productName: 'E2E Cotton Tee' };
}

async function pickCustomerAndProduct(page: Page, seeded: SeededCatalog) {
  await page.getByRole('searchbox', { name: /find the customer/i }).fill(seeded.customerName);
  await page.getByRole('button', { name: new RegExp(seeded.customerName) }).click();
  await expect(page.getByLabel('Shipping address')).toHaveValue(/12 Buyer Road/);

  await page.getByRole('searchbox', { name: /add a product/i }).fill(seeded.productName);
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('heading', { name: seeded.productName })).toBeVisible();
}

test.describe('orders', () => {
  test('creates, confirms, edits, searches and filters an order through the screens', async ({
    page,
    request: apiRequest,
  }) => {
    const { accessToken, businessId } = await signUpOwner(apiRequest);
    const seeded = await seedCatalogAndCustomer(apiRequest, accessToken, businessId);
    await setAuthState(page, accessToken, businessId);

    // The queue opens on the Active filter and shows the empty state (AC-14).
    await page.goto('/orders');
    await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible();
    await expect(page.getByText('No active orders')).toBeVisible();

    await page
      .getByRole('link', { name: /new order/i })
      .first()
      .click();
    // The first visit compiles the route in dev, which can take a few seconds.
    await expect(page).toHaveURL(/\/orders\/new$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Create order' })).toBeVisible();

    // Pick an active customer; their address prefills the shipping address (AC-15).
    await pickCustomerAndProduct(page, seeded);

    await page.getByLabel('Source').selectOption('FACEBOOK');
    await page.getByLabel('Delivery fee').fill('50');
    await page.getByLabel('Discount').fill('10');
    await page.getByLabel('Notes').fill('Leave at the front desk.');

    // Live totals: 1,200 subtotal + 50 delivery - 10 discount (AC-4, AC-15).
    const summary = page.getByRole('heading', { name: 'Order total' }).locator('..');
    await expect(summary.getByText('1,240 USD', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Create order', exact: true }).click();

    // A successful save lands on the detail page (AC-2, AC-15).
    await page.waitForURL(
      /\/orders\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    await expect(page.getByRole('heading', { level: 1, name: 'ORD-0001' })).toBeVisible();
    await expect(page.getByText(/Facebook · Placed/)).toBeVisible();
    await expect(page.getByText('Created as Pending')).toBeVisible();

    // The detail page shows the snapshots, totals, and due amounts (AC-8, AC-16).
    const totals = page.getByRole('heading', { name: 'Totals' }).locator('..');
    await expect(totals.getByText('1,200 USD', { exact: true })).toBeVisible();
    await expect(totals.getByText('50 USD', { exact: true })).toBeVisible();
    await expect(totals.getByText('1,240 USD', { exact: true })).toHaveCount(2);
    await expect(page.getByRole('link', { name: /\+8801/ })).toBeVisible();

    // Confirm the order with a note (AC-10, AC-16, AC-18).
    await page.getByRole('button', { name: 'Confirm order' }).click();
    const statusDialog = page.getByRole('dialog', { name: /mark as confirmed/i });
    await expect(statusDialog).toBeVisible();
    await statusDialog.getByLabel('Note').fill('Called the buyer.');
    await statusDialog.getByRole('button', { name: 'Confirm order', exact: true }).click();

    await expect(page.getByText('Order moved to Confirmed.')).toBeVisible();
    await expect(page.getByText('Moved from Pending to Confirmed')).toBeVisible();
    await expect(page.getByText('Called the buyer.')).toBeVisible();

    // Edit in place while the order is still editable (AC-9, AC-16).
    await page.getByRole('button', { name: 'Edit order' }).click();
    await expect(page.getByRole('heading', { name: 'Edit ORD-0001' })).toBeVisible();
    await page.getByLabel('Notes').fill('Updated in E2E.');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByText('Order updated.')).toBeVisible();
    await expect(page.getByText('Updated in E2E.')).toBeVisible();

    // Search the list by order number, then filter by status (AC-7, AC-14).
    await page.getByRole('link', { name: /back to orders/i }).click();
    const search = page.getByRole('searchbox', { name: /search orders/i });
    await search.fill('ORD-0001');
    await expect(page.getByRole('link', { name: 'ORD-0001' })).toBeVisible();

    await search.fill('');
    await page.getByRole('button', { name: 'Cancelled', exact: true }).click();
    await expect(page.getByText('No cancelled orders')).toBeVisible();

    await page.getByRole('button', { name: /clear filters/i }).click();
    await expect(page.getByRole('button', { name: 'Active', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('link', { name: 'ORD-0001' })).toBeVisible();
  });

  test('warns about a duplicate and creates the order anyway', async ({
    page,
    request: apiRequest,
  }) => {
    const { accessToken, businessId } = await signUpOwner(apiRequest);
    const seeded = await seedCatalogAndCustomer(apiRequest, accessToken, businessId);
    await setAuthState(page, accessToken, businessId);

    const existing = await apiRequest.post('/api/orders', {
      data: {
        customerId: seeded.customerId,
        items: [{ productId: seeded.productId, quantity: 2 }],
        source: 'DIRECT',
      },
      headers: as(accessToken, businessId),
    });
    expect(existing.ok()).toBe(true);

    await page.goto('/orders/new');
    await pickCustomerAndProduct(page, seeded);
    await page.getByRole('button', { name: 'Create order', exact: true }).click();

    // The dialog names the existing order and offers both routes (AC-5, AC-15).
    const duplicateDialog = page.getByRole('dialog', { name: /this looks like a duplicate/i });
    await expect(duplicateDialog).toBeVisible();
    await expect(duplicateDialog.getByText('ORD-0001')).toBeVisible();
    await expect(duplicateDialog.getByRole('link', { name: /view existing order/i })).toBeVisible();

    await duplicateDialog.getByRole('button', { name: /create anyway/i }).click();

    await page.waitForURL(
      /\/orders\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    await expect(page.getByRole('heading', { level: 1, name: 'ORD-0002' })).toBeVisible();
  });

  test('warns about a past deadline, flags the order as overdue, then clears it', async ({
    page,
    request: apiRequest,
  }) => {
    const { accessToken, businessId } = await signUpOwner(apiRequest);
    const seeded = await seedCatalogAndCustomer(apiRequest, accessToken, businessId);
    await setAuthState(page, accessToken, businessId);

    await page.goto('/orders/new');
    await expect(page.getByRole('heading', { level: 1, name: 'Create order' })).toBeVisible();
    await pickCustomerAndProduct(page, seeded);

    // A past promise warns but never blocks the save (AC-15, AC-19).
    await page.getByLabel('Delivery deadline').fill('2020-01-01');
    await expect(
      page.getByText('This date has already passed. You can still save the order.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Create order', exact: true }).click();
    await page.waitForURL(
      /\/orders\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    // The detail header keeps the day and derives the badge (AC-16, AC-19).
    await expect(page.getByRole('heading', { level: 1, name: 'ORD-0001' })).toBeVisible();
    await expect(page.getByText('Jan 1, 2020')).toBeVisible();
    await expect(page.getByText('Overdue', { exact: true })).toBeVisible();

    // The queue shows the same promise and flag (AC-14, AC-19).
    await page.getByRole('link', { name: /back to orders/i }).click();
    await expect(page.getByRole('link', { name: 'ORD-0001' })).toBeVisible();
    await expect(page.getByText('Jan 1, 2020').filter({ visible: true }).first()).toBeVisible();
    await expect(
      page.getByText('Overdue', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();

    // Clearing the promise removes the flag and reads as not set (AC-16, AC-19).
    await page.getByRole('link', { name: 'ORD-0001' }).first().click();
    await page.getByRole('button', { name: 'Edit order' }).click();
    await expect(page.getByRole('heading', { name: 'Edit ORD-0001' })).toBeVisible();
    await page.getByLabel('Delivery deadline').fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByText('Order updated.')).toBeVisible();
    await expect(page.getByText('Not set')).toBeVisible();
    await expect(page.getByText('Overdue', { exact: true })).toHaveCount(0);
  });

  // covers AC-8, AC-9: a business on Pacific/Kiritimati is already a day ahead
  // of the browser. The badge and the warning must use the business day, and
  // every timestamp renders in the business zone.
  test('derives the badge and timestamps from the business zone, not the browser', async ({
    page,
    request: apiRequest,
  }) => {
    const { accessToken, businessId } = await signUpOwner(apiRequest, 'Pacific/Kiritimati');
    const seeded = await seedCatalogAndCustomer(apiRequest, accessToken, businessId);
    await setAuthState(page, accessToken, businessId);

    await page.goto('/orders/new');
    await expect(page.getByRole('heading', { level: 1, name: 'Create order' })).toBeVisible();
    await pickCustomerAndProduct(page, seeded);

    // Today in Kiritimati is always at least as late as today in UTC. A past
    // date therefore always reads as passed there, and the badge must appear.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    await page.getByLabel('Delivery deadline').fill(yesterday);
    await expect(
      page.getByText('This date has already passed. You can still save the order.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Create order', exact: true }).click();
    await page.waitForURL(
      /\/orders\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    await expect(page.getByText('Overdue', { exact: true })).toBeVisible();

    // The placed time carries the business wall clock, never the browser's
    // (AC-8). Compare the rendered hour with the hour in each zone right now.
    const placed = page.getByText(/Placed/).first();
    await expect(placed).toBeVisible();
    const placedText = (await placed.textContent()) ?? '';
    const hourIn = (timeZone: string) =>
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone }).format(
        new Date(),
      );

    const renderedHour = placedText.match(/(\d{1,2}):\d{2}\s?(AM|PM)/);
    expect(renderedHour).not.toBeNull();
    const hour24 = ((Number(renderedHour![1]) % 12) + (renderedHour![2] === 'PM' ? 12 : 0)) % 24;

    // Kiritimati is UTC+14 and the Playwright browser runs on UTC, so a
    // timestamp rendered in the browser zone could not land on the business hour.
    expect(Math.abs(Number(hourIn('Pacific/Kiritimati')) - hour24)).toBeLessThanOrEqual(1);
    expect(Math.abs(Number(hourIn('UTC')) - hour24)).toBeGreaterThan(1);
  });
});
