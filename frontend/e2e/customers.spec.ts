import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// E2E for the customer records flow (spec 0005).
// Requires the dev stack: backend on :4000, frontend on :3000, MongoDB replica set running.
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
    await page.waitForURL(/\/customers\/[0-9a-f]{24}$/);
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
});
