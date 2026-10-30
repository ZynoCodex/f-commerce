import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // The dev stack compiles on demand and the filesystem is slow, so a full
  // onboarding and settings test can take longer than the 30 second default.
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});
