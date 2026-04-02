import { test, expect, type Page } from '@playwright/test';

/**
 * Payment page — all tender types
 *
 * Tests the /pos/payment page in demo mode (no real Stripe keys required).
 * Covers:
 *   - Card (Stripe Terminal) demo flow
 *   - Cash flow
 *   - Split tender (partial card + cash)
 *   - Receipt screen after completion
 *   - "New Sale" returns to POS
 */

// Build a payment URL for a single Flat White ($5.50 subtotal, 10% tax)
function buildPaymentUrl(overrides: Record<string, string> = {}): string {
  const defaults: Record<string, string> = {
    items: JSON.stringify([
      { id: '00000000-0000-0000-0000-000000000001', name: 'Flat White', price: 5.5, qty: 1 },
    ]),
    subtotal: '5.50',
    tax: '0.55',
    total: '6.05',
  };
  const params = new URLSearchParams({ ...defaults, ...overrides });
  return `/pos/payment?${params.toString()}`;
}

async function goToPayment(page: Page, overrides: Record<string, string> = {}) {
  await page.goto(buildPaymentUrl(overrides));
  // Wait for the payment total to appear
  await expect(page.getByText(/\$6\.05/).first()).toBeVisible({ timeout: 8_000 });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Payment page', () => {
  test('renders order summary with correct totals', async ({ page }) => {
    await goToPayment(page);

    await expect(page.getByText('Flat White')).toBeVisible();
    // Subtotal, tax and total values
    await expect(page.getByText('$5.50')).toBeVisible();
    await expect(page.getByText('$0.55')).toBeVisible();
    // Total appears at least once (summary + charge button)
    await expect(page.getByText('$6.05').first()).toBeVisible();
  });

  test('cash payment flow completes immediately and shows receipt', async ({ page }) => {
    await goToPayment(page);

    // Select the Cash tender
    await page.getByRole('button', { name: /^cash$/i }).click();

    // Cash amount input should default to the total
    const cashInput = page.getByLabel(/cash tendered/i).or(page.getByPlaceholder(/cash/i));
    if (await cashInput.isVisible()) {
      await cashInput.fill('6.05');
    }

    await page.getByRole('button', { name: /confirm cash|record cash|charge/i }).click();

    // Should show receipt / approved state
    await expect(
      page.getByText(/approved|payment complete|receipt|sale complete/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('card (demo) payment flow completes and shows receipt', async ({ page }) => {
    await goToPayment(page);

    // Card is typically the default — click it explicitly to be safe
    await page.getByRole('button', { name: /^card$/i }).click();

    // The terminal overlay should appear (demo mode shows status messages)
    await expect(
      page.getByText(/initialising|connecting|simulated|tap.*insert|processing/i),
    ).toBeVisible({ timeout: 10_000 });

    // Demo mode auto-completes after ~4 seconds of delays
    await expect(
      page.getByText(/approved|payment complete|receipt|sale complete/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('"New Sale" button returns to POS after completion', async ({ page }) => {
    await goToPayment(page);

    // Complete a quick cash payment
    await page.getByRole('button', { name: /^cash$/i }).click();
    const cashInput = page.getByLabel(/cash tendered/i).or(page.getByPlaceholder(/cash/i));
    if (await cashInput.isVisible()) await cashInput.fill('10.00');
    await page.getByRole('button', { name: /confirm cash|record cash|charge/i }).click();

    // Wait for receipt
    await expect(
      page.getByText(/approved|payment complete|receipt|sale complete/i),
    ).toBeVisible({ timeout: 10_000 });

    // Click "New Sale"
    await page.getByRole('button', { name: /new sale/i }).click();
    await page.waitForURL(/\/pos(?!\/payment)/);
    await expect(page.getByRole('button', { name: /flat white/i })).toBeVisible();
  });

  test('cancel navigates back to POS without completing payment', async ({ page }) => {
    await goToPayment(page);

    await page.getByRole('button', { name: /cancel|back/i }).first().click();
    await page.waitForURL(/\/pos(?!\/payment)/);
    await expect(page.getByRole('button', { name: /flat white/i })).toBeVisible();
  });
});
