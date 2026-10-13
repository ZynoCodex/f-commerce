import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// E2E for the onboarding + settings flow (spec 0004).
// Requires the dev stack: backend on :4000, frontend on :3000, MongoDB running.
// Covers AC-1, AC-3, AC-4, AC-5. Run with: npm run e2e --workspace @f-commerce/frontend

test.use({ baseURL: 'http://localhost:3000' });

test.describe('business onboarding flow', () => {
  const password = 'password123';

  // Helper to authenticate a user (register or login) and return auth state
  async function authenticateUser(
    apiRequest: APIRequestContext,
    email: string,
    businessName: string,
  ) {
    // Try to register first
    const registerRes = await apiRequest.post('/api/auth/register', {
      data: { email, password, name: email.split('@')[0], businessName },
    });

    const data = await registerRes.json();
    if (!registerRes.ok() && data.error?.includes('already')) {
      // If duplicate, try login
      const loginRes = await apiRequest.post('/api/auth/login', {
        data: { email, password },
      });
      const loginData = await loginRes.json();
      try {
        const payload = Buffer.from(loginData.accessToken.split('.')[1], 'base64').toString();
        const parsed = JSON.parse(payload);
        return {
          accessToken: loginData.accessToken,
          businessId: parsed.memberships?.[0]?.businessId,
        };
      } catch {
        return { accessToken: loginData.accessToken, businessId: loginData.businessId };
      }
    }

    try {
      const payload = Buffer.from(data.accessToken.split('.')[1], 'base64').toString();
      const parsed = JSON.parse(payload);
      return { accessToken: data.accessToken, businessId: parsed.memberships?.[0]?.businessId };
    } catch {
      return { accessToken: data.accessToken, businessId: data.businessId };
    }
  }

  // Helper to set auth state in browser context
  async function setAuthState(
    page: import('@playwright/test').Page,
    accessToken: string,
    businessId: string,
  ) {
    await page.addInitScript(
      (auth) => {
        window.localStorage.setItem('accessToken', auth.accessToken);
        window.localStorage.setItem('businessId', auth.businessId);
      },
      { accessToken, businessId },
    );
  }

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('owner who completed onboarding lands on the dashboard, not the wizard', async ({
    page,
    request: apiRequest,
  }) => {
    const email = `completed-${randomUUID().slice(0, 8)}@example.com`;

    const { accessToken, businessId } = await authenticateUser(
      apiRequest,
      email,
      'Completed E2E Co',
    );
    expect(accessToken).toBeTruthy();
    expect(businessId).toBeTruthy();

    // Complete onboarding via API
    await apiRequest.post('/api/business/onboarding', {
      data: {
        name: 'Completed E2E Co',
        currency: 'USD',
        address: { street: '100 Main St', city: 'Dhaka', country: 'Bangladesh' },
      },
      headers: { Authorization: `Bearer ${accessToken}`, 'x-business-id': businessId },
    });

    await setAuthState(page, accessToken, businessId);

    await page.goto('/onboarding');
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /keep today moving/i })).toBeVisible();
  });

  test('a fresh owner walks the wizard to completion and reaches the dashboard', async ({
    page,
    request: apiRequest,
  }) => {
    const email = `fresh-${randomUUID().slice(0, 8)}@example.com`;

    const { accessToken, businessId } = await authenticateUser(apiRequest, email, 'Fresh E2E Co');
    expect(accessToken).toBeTruthy();
    expect(businessId).toBeTruthy();

    await setAuthState(page, accessToken, businessId);

    await page.goto('/onboarding');

    // Step 1: business name
    const name = page.getByRole('textbox', { name: /business name/i });
    await expect(page.getByRole('button', { name: /^continue$/i })).toBeDisabled();
    await name.fill('Fresh E2E Co');
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Step 2: address
    await page.getByRole('heading', { name: /billing address/i }).waitFor();
    await page.getByRole('textbox', { name: /street/i }).fill('1 Test Street');
    await page.getByRole('textbox', { name: /city/i }).fill('Dhaka');
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Step 3: currency (skip logo for this test)
    await page.getByRole('heading', { name: /your currency and logo/i }).waitFor();
    await page.getByRole('combobox', { name: /currency/i }).selectOption('BDT');
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Step 4: review and finish
    await page.getByRole('heading', { name: /review and finish/i }).waitFor();
    await expect(page.getByText('Fresh E2E Co')).toBeVisible();
    await page.getByRole('button', { name: /enter order desk/i }).click();

    await page.waitForURL('/dashboard', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /keep today moving/i })).toBeVisible();
  });

  test('logo upload succeeds during onboarding step 3', async ({ page, request: apiRequest }) => {
    const email = `logo-${randomUUID().slice(0, 8)}@example.com`;

    const { accessToken, businessId } = await authenticateUser(apiRequest, email, 'Logo E2E Co');
    expect(accessToken).toBeTruthy();
    expect(businessId).toBeTruthy();

    await setAuthState(page, accessToken, businessId);

    await page.goto('/onboarding');

    // Fill step 1
    const name = page.getByRole('textbox', { name: /business name/i });
    await name.fill('Logo E2E Co');
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Fill step 2
    await page.getByRole('heading', { name: /billing address/i }).waitFor();
    await page.getByRole('textbox', { name: /street/i }).fill('1 Test Street');
    await page.getByRole('textbox', { name: /city/i }).fill('Dhaka');
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Step 3: upload logo
    await page.getByRole('heading', { name: /your currency and logo/i }).waitFor();
    await page.getByRole('combobox', { name: /currency/i }).selectOption('USD');

    // Create a valid 1x1 PNG
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const pngBuffer = Buffer.from(pngBase64, 'base64');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test-logo.png',
      mimeType: 'image/png',
      buffer: pngBuffer,
    });

    await page.waitForSelector('img[alt="Logo preview"]', { state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: /^continue$/i }).click();

    await page.getByRole('heading', { name: /review and finish/i }).waitFor();
  });

  test('owner edits the profile from settings and sees confirmation', async ({
    page,
    request: apiRequest,
  }) => {
    const email = `settings-${randomUUID().slice(0, 8)}@example.com`;

    const { accessToken, businessId } = await authenticateUser(
      apiRequest,
      email,
      'Settings E2E Co',
    );

    // Complete onboarding first
    await apiRequest.post('/api/business/onboarding', {
      data: {
        name: 'Settings E2E Co',
        currency: 'USD',
        address: { street: '100 Main St', city: 'Dhaka', country: 'Bangladesh' },
      },
      headers: { Authorization: `Bearer ${accessToken}`, 'x-business-id': businessId },
    });

    await setAuthState(page, accessToken, businessId);

    await page.goto('/settings');

    const name = page.getByRole('textbox', { name: /business name/i });
    await name.fill('Renamed E2E');
    await page.getByRole('button', { name: /save changes/i }).click();

    await expect(page.getByRole('status', { name: /profile updated/i })).toBeVisible();
  });

  test('draft saves and resumes on next visit', async ({ page, request: apiRequest }) => {
    const email = `draft-${randomUUID().slice(0, 8)}@example.com`;

    const { accessToken, businessId } = await authenticateUser(apiRequest, email, 'Draft E2E Co');
    expect(accessToken).toBeTruthy();
    expect(businessId).toBeTruthy();

    await setAuthState(page, accessToken, businessId);

    // Start onboarding, fill step 1, then navigate away
    await page.goto('/onboarding');
    const name = page.getByRole('textbox', { name: /business name/i });
    await name.fill('Draft E2E Co');
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Fill partial address (incomplete draft)
    await page.getByRole('heading', { name: /billing address/i }).waitFor();
    await page.getByRole('textbox', { name: /street/i }).fill('50 Draft Lane');
    // Don't fill city - just wait for draft to save

    // Reload the page
    await page.reload();
    await page.goto('/onboarding');

    // Should show the business name already filled (from draft)
    const nameField = page.getByRole('textbox', { name: /business name/i });
    await expect(nameField).toHaveValue('Draft E2E Co');

    // Continue the flow
    await page.getByRole('button', { name: /^continue$/i }).click();
    await page.getByRole('textbox', { name: /city/i }).fill('Dhaka');
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Should be able to complete the wizard
    await page.getByRole('heading', { name: /your currency and logo/i }).waitFor();
  });
});
