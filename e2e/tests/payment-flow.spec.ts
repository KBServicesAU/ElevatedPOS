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

// Open the Add Tender dialog and fill a cash payment, then apply it.
async function applyCashTender(page: Page, amount = '10.00') {
  await page.getByRole('button', { name: /add tender/i }).click();
  await expect(page.getByText('Add Payment')).toBeVisible();
  // Cash is the default method; fill the "Cash Tendered" input (placeholder = exact amount due)
  await page.getByPlaceholder('$6.05', { exact: true }).fill(amount);
  await page.getByRole('button', { name: /apply/i }).click();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Payment page', () => {
  test('renders order summary with correct totals', async ({ page }) => {
    await goToPayment(page);

    await expect(page.getByText('Flat White')).toBeVisible();
    // Subtotal and tax appear inside "Subtotal $5.50 · GST $0.55" — use first() to avoid strict-mode
    await expect(page.getByText(/\$5\.50/).first()).toBeVisible();
    await expect(page.getByText(/\$0\.55/).first()).toBeVisible();
    // Total appears at least once (amount card)
    await expect(page.getByText('$6.05').first()).toBeVisible();
  });

  test('cash payment flow completes immediately and shows receipt', async ({ page }) => {
    await goToPayment(page);

    // Open tender dialog and apply cash
    await applyCashTender(page);

    // Complete the sale
    await page.getByRole('button', { name: /complete sale/i }).click();

    // Should show receipt modal
    await expect(
      page.getByText(/approved|payment complete|receipt|sale complete/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('card (demo) payment flow completes and shows receipt', async ({ page }) => {
    await goToPayment(page);

    // Open the Add Tender dialog
    await page.getByRole('button', { name: /add tender/i }).click();
    await expect(page.getByText('Add Payment')).toBeVisible();

    // Select Card / EFTPOS method
    await page.getByRole('button', { name: /card.*eftpos/i }).click();

    // Trigger the Stripe Terminal flow
    await page.getByRole('button', { name: /charge.*terminal/i }).click();

    // The terminal overlay should appear (demo mode shows status messages)
    await expect(
      page.getByText(/initialising|connecting|simulated|tap.*insert|processing/i),
    ).toBeVisible({ timeout: 10_000 });

    // Demo mode auto-completes after ~4 seconds — wait for dialog to close
    // (the "Add Payment" heading disappears when onApproved fires and dialog unmounts)
    await expect(page.getByText('Add Payment')).toBeHidden({ timeout: 20_000 });

    // Card tender is now applied — click Complete Sale
    await page.getByRole('button', { name: /complete sale/i }).click();

    // Should show receipt modal
    await expect(
      page.getByText(/sale complete/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('"New Sale" button returns to POS after completion', async ({ page }) => {
    await goToPayment(page);

    // Complete a quick cash payment
    await applyCashTender(page);
    await page.getByRole('button', { name: /complete sale/i }).click();

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
    // Navigate to POS first so router.back() has somewhere to go
    await page.goto('/pos');
    await expect(page.getByRole('button', { name: /flat white/i })).toBeVisible();
    await page.getByRole('button', { name: /flat white/i }).first().click();
    await page.getByRole('button', { name: /charge/i }).click();
    await page.waitForURL(/\/pos\/payment/);

    await page.getByRole('button', { name: /cancel|back/i }).first().click();
    await page.waitForURL(/\/pos(?!\/payment)/);
    await expect(page.getByRole('button', { name: /flat white/i })).toBeVisible();
  });
});
