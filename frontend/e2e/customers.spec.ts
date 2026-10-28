import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// E2E for the customer records flow (spec 0005).
// Requires the dev stack: backend on :4000, frontend on :3000, PostgreSQL running.
// Run with: npm run e2e --workspace @f-commerce/frontend

test.use({ baseURL: 'http://localhost:3000' });

test.describe('customer records', () => {
  const password = 'password123';

  async function signUpOwner(apiRequest: APIRequestContext) {
    const email = `cust-${randomUUID().slice(0, 8)}@example.com`;
    const res = await apiRequest.post('/api/auth/register', {
      data: { email, password, name: 'Owner', businessName: 'Customers E2E Co' },
    });
    const data = await res.json();
    const payload = JSON.parse(Buffer.from(data.accessToken.split('.')[1], 'base64').toString());
    const accessToken: string = data.accessToken;
    const businessId: string = payload.memberships?.[0]?.businessId ?? data.businessId;

    await apiRequest.put('/api/business/onboarding', {
      data: {
        name: 'Customers E2E Co',
        currency: 'USD',
        timezone: 'Asia/Dhaka',
        address: { street: '1 E2E Street', city: 'Dhaka', country: 'Bangladesh' },
      },
      headers: { Authorization: `Bearer ${accessToken}`, 'x-business-id': businessId },
    });

    return { accessToken, businessId };
  }

  async function setAuthState(
    page: import('@playwright/test').Page,
    token: string,
    businessId: string,
  ) {
    await page.addInitScript(
      (auth) => {
        window.localStorage.setItem('accessToken', auth.accessToken);
        window.localStorage.setItem('businessId', auth.businessId);
      },
      { accessToken: token, businessId },
    );
  }

  function as(token: string, businessId: string) {
    return { Authorization: `Bearer ${token}`, 'x-business-id': businessId };
  }

  test('create, search, edit and archive a customer through the screens', async ({
    page,
    request: apiRequest,
  }) => {
    const { accessToken, businessId } = await signUpOwner(apiRequest);
    await setAuthState(page, accessToken, businessId);

    const unique = randomUUID().replace(/\D/g, '').slice(0, 8).padStart(8, '9');
    const phone = `+8801${unique}`;

    await page.goto('/customers');
    await expect(page.getByRole('heading', { level: 1, name: 'Customers' })).toBeVisible();

    // Create (AC-1)
    await page.getByRole('button', { name: /add customer/i }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Nusrat Jahan');
    await page.getByRole('textbox', { name: 'Phone', exact: true }).fill(phone);
    await page.getByRole('textbox', { name: /email/i }).fill('nusrat@example.com');
    await page.getByRole('button', { name: /save customer/i }).click();

    await expect(page.getByRole('link', { name: 'Nusrat Jahan' }).first()).toBeVisible();

    // Search by name prefix (AC-5)
    await page.getByRole('searchbox', { name: /search by name or phone/i }).fill('Nusr');
    await expect(page.getByRole('link', { name: 'Nusrat Jahan' }).first()).toBeVisible();

    // Empty search state (AC-5)
    await page.getByRole('searchbox', { name: /search by name or phone/i }).fill('zzzznomatch');
    await expect(page.getByText(/no customers match/i)).toBeVisible();
    await page.getByRole('searchbox', { name: /search by name or phone/i }).fill('');
    // Wait for the cleared search to refetch before clicking, otherwise the
    // click lands on a row that is about to be replaced.
    const nameLink = page.getByRole('link', { name: 'Nusrat Jahan' }).first();
    await expect(nameLink).toBeVisible();

    // Open the profile (AC-6)
    await nameLink.click();
    // Ids are UUIDs since the PostgreSQL migration, not 24-character ObjectIds.
    await page.waitForURL(
      /\/customers\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    await expect(page.getByRole('link', { name: phone, exact: true })).toHaveAttribute(
      'href',
      `tel:${phone}`,
    );

    // Edit (AC-4)
    await page.getByRole('button', { name: /edit/i }).first().click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Nusrat J. Rahman');
    await page.getByRole('button', { name: /^save/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Nusrat J. Rahman' })).toBeVisible();

    // Archive (AC-8)
    await page
      .getByRole('button', { name: /^archive$/i })
      .first()
      .click();
    await expect(page.getByText(/cannot be used for new transactions/i)).toBeVisible();
  });

  test('duplicate phone is blocked and links to the existing customer', async ({
    page,
    request: apiRequest,
  }) => {
    const { accessToken, businessId } = await signUpOwner(apiRequest);
    await setAuthState(page, accessToken, businessId);

    const unique = randomUUID().replace(/\D/g, '').slice(0, 8).padStart(8, '9');
    const phone = `+8802${unique}`;

    await apiRequest.post('/api/customers', {
      data: { name: 'First Buyer', phone },
      headers: { Authorization: `Bearer ${accessToken}`, 'x-business-id': businessId },
    });

    await page.goto('/customers');
    await page.getByRole('button', { name: /add customer/i }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Second Buyer');
    await page.getByRole('textbox', { name: 'Phone', exact: true }).fill(phone);
    await page.getByRole('button', { name: /save customer/i }).click();

    await expect(page.getByText(/this phone already belongs to a customer/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /open the existing customer/i })).toBeVisible();
    // The typed values are kept so the seller does not retype them (AC-3)
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
      'Second Buyer',
    );
  });

  test('an archive that times out reloads the customer instead of assuming failure', async ({
    page,
    request: apiRequest,
  }) => {
    const { accessToken, businessId } = await signUpOwner(apiRequest);
    await setAuthState(page, accessToken, businessId);

    const unique = randomUUID().replace(/\D/g, '').slice(0, 8).padStart(8, '9');
    const created = await apiRequest.post('/api/customers', {
      data: { name: 'Timeout Buyer', phone: `+8803${unique}` },
      headers: { Authorization: `Bearer ${accessToken}`, 'x-business-id': businessId },
    });
    const createdBody = await created.json();
    const id: string = createdBody.data.id;

    await page.goto(`/customers/${id}`);
    await expect(page.getByRole('heading', { name: 'Timeout Buyer' })).toBeVisible();

    // Archive on the server, then make the client's archive call hang so the
    // 10 second client timeout fires (spec 0005 key invariants).
    const archived = await apiRequest.post(`/api/customers/${id}/archive`, {
      data: { version: 1 },
      headers: { Authorization: `Bearer ${accessToken}`, 'x-business-id': businessId },
    });
    expect(archived.ok()).toBe(true);
    await page.route(`**/api/customers/${id}/archive`, async () => {
      // Never fulfil: the abort controller rejects the request after 10s.
      await new Promise(() => {});
    });

    await page
      .getByRole('button', { name: /^archive$/i })
      .first()
      .click();

    // The client reloads and reports the committed state rather than an error.
    // Match each message on text only it contains: the bare /they are archived/i
    // also matches the timeout notice, and Playwright's strict mode rejects
    // locators that resolve to more than one element.
    await expect(page.getByText(/reloaded the customer: they are archived/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/cannot be used for new transactions/i)).toBeVisible();
  });

  test('restores an archived customer from the duplicate phone offer', async ({
    page,
    request: apiRequest,
  }) => {
    const { accessToken, businessId } = await signUpOwner(apiRequest);
    await setAuthState(page, accessToken, businessId);
    const headers = as(accessToken, businessId);

    const unique = randomUUID().replace(/\D/g, '').slice(0, 8).padStart(8, '9');
    const phone = `+8804${unique}`;
    const created = await apiRequest.post('/api/customers', {
      data: { name: 'Archived Buyer', phone },
      headers,
    });
    expect(created.ok()).toBe(true);
    const id = (await created.json()).data.id as string;

    const archived = await apiRequest.post(`/api/customers/${id}/archive`, {
      data: { version: 1 },
      headers,
    });
    expect(archived.ok()).toBe(true);

    await page.goto('/customers');
    await page.getByRole('button', { name: /add customer/i }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Returning Buyer');
    await page.getByRole('textbox', { name: 'Phone', exact: true }).fill(phone);
    await page.getByRole('button', { name: /save customer/i }).click();

    // AC-3: a duplicate that belongs to an archived customer offers restore.
    await expect(page.getByText('This phone belongs to an archived customer')).toBeVisible();
    await expect(
      page.getByText('Open their record to restore them, then make any changes there.'),
    ).toBeVisible();

    await page.getByRole('link', { name: /open the existing customer/i }).click();
    await page.waitForURL(new RegExp(`/customers/${id}$`));
    await expect(page.getByRole('heading', { name: 'Archived Buyer' })).toBeVisible();
    await expect(page.getByText('Archived', { exact: true })).toBeVisible();
    await expect(page.getByText(/cannot be used for new transactions/i)).toBeVisible();

    await page.getByRole('button', { name: /^restore$/i }).click();

    // AC-9: restore returns the customer to the active lists.
    await expect(page.getByText('Customer restored and back in your lists.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^edit$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^restore$/i })).toHaveCount(0);
    await expect(page.getByText('Archived', { exact: true })).toHaveCount(0);

    await page.getByRole('link', { name: /back to customers/i }).click();
    await page.getByRole('searchbox', { name: /search by name or phone/i }).fill('Archived Buyer');
    await expect(page.getByRole('link', { name: 'Archived Buyer' }).first()).toBeVisible();
  });

  test('shows the spend summary and order history on a customer profile', async ({
    page,
    request: apiRequest,
  }) => {
    const { accessToken, businessId } = await signUpOwner(apiRequest);
    await setAuthState(page, accessToken, businessId);
    const headers = as(accessToken, businessId);
    const suffix = randomUUID().slice(0, 8);

    const category = await apiRequest.post('/api/categories', {
      data: { name: `History Tops ${suffix}` },
      headers,
    });
    expect(category.ok()).toBe(true);
    const categoryId = (await category.json()).data.id as string;

    const product = await apiRequest.post('/api/products', {
      data: {
        name: 'History Tee',
        categoryId,
        sku: `HIST-${suffix}`,
        price: 1200,
        stockCount: 5,
      },
      headers,
    });
    expect(product.ok()).toBe(true);
    const productId = (await product.json()).data.id as string;

    const unique = randomUUID().replace(/\D/g, '').slice(0, 8).padStart(8, '9');
    const customer = await apiRequest.post('/api/customers', {
      data: { name: 'History Buyer', phone: `+8805${unique}` },
      headers,
    });
    expect(customer.ok()).toBe(true);
    const customerId = (await customer.json()).data.id as string;

    const order = await apiRequest.post('/api/orders', {
      data: {
        customerId,
        items: [{ productId, quantity: 1 }],
        source: 'DIRECT',
      },
      headers,
    });
    expect(order.ok()).toBe(true);
    const orderNumber = (await order.json()).data.orderNumber as string;

    await page.goto(`/customers/${customerId}`);
    await expect(page.getByRole('heading', { name: 'History Buyer' })).toBeVisible();
    await expect(page.getByText('No orders for this customer yet')).toHaveCount(0);

    // AC-6 and AC-7: the profile shows what the customer spent and owes.
    const summary = page.getByRole('heading', { name: 'Spend summary' }).locator('..');
    await expect(summary.getByText('Orders', { exact: true })).toBeVisible();
    await expect(summary.getByText('1', { exact: true })).toBeVisible();
    await expect(summary.getByText(/\$1,200\.00/)).toHaveCount(2);

    const history = page.getByRole('heading', { name: 'Order history' }).locator('..');
    const isNarrow = (page.viewportSize()?.width ?? 0) < 768;
    const orderNumberMatches = history.getByText(orderNumber, { exact: true });
    await expect(isNarrow ? orderNumberMatches.last() : orderNumberMatches.first()).toBeVisible();
    if (isNarrow) {
      await expect(history.getByText('Total $1,200.00', { exact: true })).toBeVisible();
      await expect(history.getByText('Due $1,200.00', { exact: true })).toBeVisible();
    } else {
      await expect(history.getByRole('cell', { name: '$1,200.00' })).toHaveCount(2);
    }
  });
});
