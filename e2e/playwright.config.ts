import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for ElevatedPOS.
 *
 * Tests cover the core transaction loop:
 *   POS (add items → charge) → Payment page (card / cash) → KDS (ticket appears)
 *
 * Requires the following services to be running:
 *   - web-backoffice  (BACKOFFICE_URL, default http://localhost:3000)
 *   - kds-display     (KDS_URL,        default http://localhost:3001)
 *   - orders service  (implicitly via proxy)
 *
 * In CI the services are started by docker-compose before the test run.
 * Set E2E_SKIP_WEBSERVER=true to skip the automatic server launch.
 */

const backofficeUrl = process.env['BACKOFFICE_URL'] ?? 'http://localhost:3000';
const kdsUrl        = process.env['KDS_URL']        ?? 'http://localhost:3001';
const skipServer    = process.env['E2E_SKIP_WEBSERVER'] === 'true';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // POS→KDS tests share state via the orders service
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 1 : 2,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  timeout: 30_000,
  expect: { timeout: 8_000 },

  use: {
    baseURL: backofficeUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  // In CI only chromium is installed; run webkit locally for broader coverage
  projects: process.env['CI']
    ? [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
    : [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
      ],

  // Automatically start dev servers when not in CI (or when E2E_SKIP_WEBSERVER is not set)
  webServer: skipServer
    ? undefined
    : [
        {
          command: 'pnpm --filter web-backoffice start',
          url: backofficeUrl,
          reuseExistingServer: true,
          timeout: 60_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
        {
          command: 'pnpm --filter kds-display start',
          url: kdsUrl,
          reuseExistingServer: true,
          timeout: 60_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      ],
});
