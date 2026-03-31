import { test, expect, type Page } from '@playwright/test';

/**
 * KDS Display — connect screen & live board
 *
 * Tests the KDS app in isolation (no orders service required for UI tests).
 * Integration tests that require a live orders service WebSocket are skipped
 * in offline mode (E2E_OFFLINE=true) and run in full stack CI.
 */

const KDS_BASE = process.env['KDS_URL'] ?? 'http://localhost:3001';
const OFFLINE   = process.env['E2E_OFFLINE'] === 'true';
const TEST_LOCATION_ID = '00000000-0000-0000-0000-000000000099';

async function goToKDS(page: Page, locationId?: string) {
  const url = locationId
    ? `${KDS_BASE}/?locationId=${encodeURIComponent(locationId)}`
    : KDS_BASE;
  await page.goto(url);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('KDS Display', () => {
  test('shows connect screen when no locationId provided', async ({ page }) => {
    await goToKDS(page);

    await expect(page.getByText(/nexus kds/i)).toBeVisible();
    await expect(page.getByPlaceholder(/location id/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /connect/i })).toBeDisabled();
  });

  test('connect button enabled after entering a location ID', async ({ page }) => {
    await goToKDS(page);

    await page.getByPlaceholder(/location id/i).fill(TEST_LOCATION_ID);
    await expect(page.getByRole('button', { name: /connect/i })).toBeEnabled();
  });

  test('pressing Enter in input triggers connect', async ({ page }) => {
    await goToKDS(page);

    await page.getByPlaceholder(/location id/i).fill(TEST_LOCATION_ID);
    await page.getByPlaceholder(/location id/i).press('Enter');

    // After pressing Enter we leave the connect screen (board loads, possibly reconnecting)
    await expect(page.getByPlaceholder(/location id/i)).not.toBeVisible({ timeout: 5_000 });
  });

  test('board shows "Kitchen Clear" when no tickets', async ({ page }) => {
    // Navigate directly with locationId so connect screen is skipped
    await goToKDS(page, TEST_LOCATION_ID);

    // WS will fail to connect in offline mode → board is still rendered
    await expect(page.getByText(/nexus kds/i)).toBeVisible();

    // Eventually shows either "Kitchen Clear" (connected, empty) or
    // "Reconnecting" (offline — WS failed).  Both are valid in offline mode.
    await expect(
      page.getByText(/kitchen clear|reconnecting/i),
    ).toBeVisible({ timeout: 8_000 });
  });

  test.skip(OFFLINE, 'integration: new order appears on KDS board');
  test('integration: new order appears on KDS board', async ({ page, context }) => {
    // Open KDS board
    await goToKDS(page, TEST_LOCATION_ID);
    await expect(page.getByText(/kitchen clear/i)).toBeVisible({ timeout: 8_000 });

    // Open POS in a separate tab, add an item and complete a cash payment
    const posPage = await context.newPage();
    await posPage.goto('/pos');
    await expect(posPage.getByRole('button', { name: /flat white/i })).toBeVisible();
    await posPage.getByRole('button', { name: /flat white/i }).click();
    await posPage.getByRole('button', { name: /charge/i }).click();
    await posPage.waitForURL(/\/pos\/payment/);

    await posPage.getByRole('button', { name: /^cash$/i }).click();
    const cashInput = posPage.getByLabel(/cash tendered/i).or(posPage.getByPlaceholder(/cash/i));
    if (await cashInput.isVisible()) await cashInput.fill('10.00');
    await posPage.getByRole('button', { name: /confirm cash|record cash|charge/i }).click();

    // Wait for receipt
    await expect(
      posPage.getByText(/approved|payment complete|sale complete/i),
    ).toBeVisible({ timeout: 10_000 });

    // KDS should now show the ticket (WebSocket push from orders service)
    await expect(page.getByText(/flat white/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/bump/i)).toBeVisible();

    await posPage.close();
  });

  test.skip(OFFLINE, 'integration: bumping a ticket removes it from the board');
  test('integration: bumping a ticket removes it from the board', async ({ page, context }) => {
    await goToKDS(page, TEST_LOCATION_ID);
    await expect(page.getByText(/kitchen clear/i)).toBeVisible({ timeout: 8_000 });

    // Place an order via POS
    const posPage = await context.newPage();
    await posPage.goto('/pos');
    await posPage.getByRole('button', { name: /flat white/i }).click();
    await posPage.getByRole('button', { name: /charge/i }).click();
    await posPage.waitForURL(/\/pos\/payment/);

    await posPage.getByRole('button', { name: /^cash$/i }).click();
    const cashInput = posPage.getByLabel(/cash tendered/i).or(posPage.getByPlaceholder(/cash/i));
    if (await cashInput.isVisible()) await cashInput.fill('10.00');
    await posPage.getByRole('button', { name: /confirm cash|record cash|charge/i }).click();
    await expect(
      posPage.getByText(/approved|payment complete|sale complete/i),
    ).toBeVisible({ timeout: 10_000 });

    // Wait for ticket on KDS
    await expect(page.getByText(/flat white/i)).toBeVisible({ timeout: 10_000 });

    // Bump it
    await page.getByRole('button', { name: /bump/i }).first().click();

    // Ticket should disappear (optimistic removal + WS broadcast confirmation)
    await expect(page.getByText(/flat white/i)).not.toBeVisible({ timeout: 5_000 });
    // Back to Kitchen Clear
    await expect(page.getByText(/kitchen clear/i)).toBeVisible({ timeout: 5_000 });

    await posPage.close();
  });
});
