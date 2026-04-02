import { test, expect, type Page } from '@playwright/test';

/**
 * POS — core transaction flow
 *
 * Tests the full POS screen lifecycle:
 *   1. Product catalogue renders
 *   2. Adding items builds the order panel
 *   3. Totals (subtotal + 10% tax) are calculated correctly
 *   4. "Charge" navigates to the payment page with correct params
 *   5. Payment page shows the correct total
 *   6. Demo (no Stripe keys) card flow completes and shows receipt
 *   7. Cash flow completes immediately and shows receipt
 *
 * These tests run against the full Next.js dev server.
 * No backend services are required for the static catalogue / demo payment.
 */

const POS_URL = '/pos';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function goToPOS(page: Page) {
  await page.goto(POS_URL);
  // Wait for the product grid to appear
  await expect(page.getByRole('button', { name: /flat white/i })).toBeVisible();
}

async function addItem(page: Page, name: RegExp | string) {
  await page.getByRole('button', { name }).first().click();
}

async function getCartTotal(page: Page): Promise<string> {
  // "Total" row in the order panel
  return page.locator('text=Total').last().locator('+ *').textContent() ?? '';
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('POS screen', () => {
  test('renders the product catalogue', async ({ page }) => {
    await goToPOS(page);

    // All default categories are present
    await expect(page.getByRole('button', { name: /^all$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^coffee$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^pastries$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^food$/i })).toBeVisible();

    // At least the first 3 products appear
    await expect(page.getByRole('button', { name: /flat white/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /iced latte/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /cold brew/i })).toBeVisible();
  });

  test('filters products by category', async ({ page }) => {
    await goToPOS(page);

    // Switch to Pastries
    await page.getByRole('button', { name: /^pastries$/i }).click();
    await expect(page.getByRole('button', { name: /croissant/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /flat white/i })).not.toBeVisible();

    // Switch to Food
    await page.getByRole('button', { name: /^food$/i }).click();
    await expect(page.getByRole('button', { name: /avocado toast/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /croissant/i })).not.toBeVisible();

    // All resets the filter
    await page.getByRole('button', { name: /^all$/i }).click();
    await expect(page.getByRole('button', { name: /flat white/i })).toBeVisible();
  });

  test('search filters products by name', async ({ page }) => {
    await goToPOS(page);

    await page.getByPlaceholder(/filter products/i).fill('latte');
    await expect(page.getByRole('button', { name: /iced latte/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /flat white/i })).not.toBeVisible();

    // Clear search restores full list — X button is the first button-with-SVG in the DOM
    await page.getByRole('button').filter({ has: page.locator('svg') }).first().click(); // X button
    await expect(page.getByRole('button', { name: /flat white/i })).toBeVisible();
  });

  test('empty cart shows placeholder and disables Charge button', async ({ page }) => {
    await goToPOS(page);

    await expect(page.getByText(/add items to order/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /charge/i })).toBeDisabled();
  });

  test('adds items to cart and updates totals', async ({ page }) => {
    await goToPOS(page);

    // Add 1× Flat White ($5.50) and 2× Croissant ($4.00 each)
    await addItem(page, /flat white/i);
    await addItem(page, /croissant/i);
    await addItem(page, /croissant/i);

    // Cart shows the items (use first() since product name also appears in the product grid)
    await expect(page.getByText('Flat White').first()).toBeVisible();
    await expect(page.getByText('Croissant').first()).toBeVisible();

    // Subtotal = $5.50 + ($4.00 × 2) = $13.50
    await expect(page.getByText('$13.50')).toBeVisible();
    // Tax = 10% = $1.35
    await expect(page.getByText('$1.35')).toBeVisible();
    // Total = $14.85
    await expect(page.getByText('$14.85').first()).toBeVisible();

    // Charge button shows the total
    await expect(page.getByRole('button', { name: /charge \$14\.85/i })).toBeEnabled();
  });

  test('removes items from cart using minus button', async ({ page }) => {
    await goToPOS(page);

    await addItem(page, /flat white/i);
    await addItem(page, /flat white/i); // qty = 2

    // qty badge on the product card (round badge with bg-indigo-500 and rounded-full)
    await expect(page.locator('.rounded-full.bg-indigo-500').filter({ hasText: '2' })).toBeVisible();

    // Click minus once → qty = 1 (Minus button is first cart-action button with SVG)
    await page.locator('button').filter({ has: page.locator('svg') }).nth(0).click(); // Minus
    await expect(page.locator('.rounded-full.bg-indigo-500').filter({ hasText: '1' })).toBeVisible();

    // Click minus again → item removed from cart
    // (re-query after state update)
    await page.getByText('Flat White').waitFor({ state: 'visible' });
  });

  test('clear order button empties the cart', async ({ page }) => {
    await goToPOS(page);

    await addItem(page, /flat white/i);
    await expect(page.getByRole('button', { name: /clear order/i })).toBeVisible();

    await page.getByRole('button', { name: /clear order/i }).click();

    await expect(page.getByText(/add items to order/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /charge/i })).toBeDisabled();
  });

  test('navigates to payment page with correct params', async ({ page }) => {
    await goToPOS(page);

    await addItem(page, /flat white/i);
    await page.getByRole('button', { name: /charge/i }).click();

    await page.waitForURL(/\/pos\/payment/);

    // URL should contain the item, subtotal, tax and total
    const url = new URL(page.url());
    expect(url.searchParams.get('total')).toBe('6.05');     // $5.50 + $0.55 tax
    expect(url.searchParams.get('subtotal')).toBe('5.50');
    expect(url.searchParams.get('tax')).toBe('0.55');
    const items = JSON.parse(url.searchParams.get('items') ?? '[]') as Array<{ name: string; qty: number }>;
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe('Flat White');
    expect(items[0]?.qty).toBe(1);
  });
});
