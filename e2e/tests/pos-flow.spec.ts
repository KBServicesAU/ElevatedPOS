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
 * No backend services are required — all API calls are intercepted
 * via page.route() and answered with fixture data.
 */

const POS_URL = '/pos';

// ─── API Fixtures ────────────────────────────────────────────────────────────���

const FIXTURE_CATEGORIES = {
  data: [
    { id: 'c1', name: 'Coffee',   sortOrder: 0 },
    { id: 'c2', name: 'Pastries', sortOrder: 1 },
    { id: 'c3', name: 'Food',     sortOrder: 2 },
  ],
};

const FIXTURE_PRODUCTS = {
  data: [
    { id: 'p1', name: 'Flat White',    price: 550,  categoryId: 'c1', categoryName: 'Coffee',   description: 'Single origin espresso, steamed milk' },
    { id: 'p2', name: 'Iced Latte',    price: 600,  categoryId: 'c1', categoryName: 'Coffee',   description: 'Cold espresso over ice' },
    { id: 'p3', name: 'Cold Brew',     price: 500,  categoryId: 'c1', categoryName: 'Coffee',   description: '12-hour cold brew' },
    { id: 'p4', name: 'Pour Over',     price: 800,  categoryId: 'c1', categoryName: 'Coffee',   description: 'Single origin pour over' },
    { id: 'p5', name: 'Croissant',     price: 400,  categoryId: 'c2', categoryName: 'Pastries', description: 'Buttery French croissant' },
    { id: 'p6', name: 'Banana Bread',  price: 450,  categoryId: 'c2', categoryName: 'Pastries', description: 'House-made banana bread' },
    { id: 'p7', name: 'Avocado Toast', price: 1450, categoryId: 'c3', categoryName: 'Food',     description: 'Sourdough, avocado, dukkah' },
    { id: 'p8', name: 'Eggs Benedict', price: 1800, categoryId: 'c3', categoryName: 'Food',     description: 'Poached eggs, hollandaise' },
  ],
};

const FIXTURE_EMPLOYEES = {
  data: [
    { id: 'emp-e2e-1', firstName: 'Jane', lastName: 'Doe', role: 'Manager', clockedIn: true },
  ],
};

// ─── Helpers ────────────────────────────────────────────────────────��────────

/**
 * Register page.route() intercepts for all POS-related API calls so no real
 * backend services are needed.  Must be called before any navigation to /pos.
 */
async function setupApiMocks(page: Page) {
  // Catalog — products
  await page.route('**/api/proxy/catalog/products**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FIXTURE_PRODUCTS),
    }),
  );

  // Catalog — categories
  await page.route('**/api/proxy/catalog/categories**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FIXTURE_CATEGORIES),
    }),
  );

  // Employees — staff screen list
  await page.route('**/api/proxy/employees**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FIXTURE_EMPLOYEES),
    }),
  );

  // Device PIN verification — always succeed in E2E
  await page.route('**/api/auth/device-pin-verify**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    }),
  );
}

/**
 * Inject a fake device session into localStorage so the POS page skips the
 * device-pairing gate.  Then navigate through the staff screen so the POS
 * terminal is visible before tests start.
 *
 * Must be called in beforeEach before any assertions.
 */
async function seedDeviceSession(page: Page) {
  // 1. Set up route mocks BEFORE navigating (they persist for this page context)
  await setupApiMocks(page);

  // 2. Navigate to /pos so we are on the right origin to write localStorage
  await page.goto(POS_URL);

  // 3. Seed device info into localStorage
  await page.evaluate(() => {
    localStorage.setItem('nexus_device_token', 'e2e-fake-device-token');
    localStorage.setItem('nexus_device_info', JSON.stringify({
      deviceId: '00000000-0000-0000-0000-e2e000000001',
      role: 'pos',
      locationId: '00000000-0000-0000-0000-000000000099',
      orgId: '00000000-0000-0000-0000-000000000001',
      label: 'E2E Test POS',
    }));
  });

  // 4. Reload — now the page sees the device token and shows the Staff Screen
  await page.reload();

  // 5. Staff screen: wait for employee card to appear, then click it
  await expect(page.getByText('Jane')).toBeVisible({ timeout: 10_000 });
  await page.getByText('Jane').first().click();

  // 6. PIN pad: enter any 4-digit PIN (our mock always returns ok: true)
  for (const digit of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: new RegExp(`^${digit}$`) }).click();
  }

  // 7. POS terminal should now be visible
  await expect(page.getByRole('button', { name: /flat white/i })).toBeVisible({ timeout: 10_000 });
}

async function goToPOS(page: Page) {
  // seedDeviceSession already navigated us to the POS terminal.
  // Just assert the product grid is ready.
  await expect(page.getByRole('button', { name: /flat white/i })).toBeVisible();
}

async function addItem(page: Page, name: RegExp | string) {
  await page.getByRole('button', { name }).first().click();
}

async function getCartTotal(page: Page): Promise<string> {
  // "Total" row in the order panel
  return page.locator('text=Total').last().locator('+ *').textContent() ?? '';
}

// ─── Tests ───────────────────────────────────────────────────────────────────��

test.describe('POS screen', () => {
  test.beforeEach(async ({ page }) => {
    await seedDeviceSession(page);
  });

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

    // Flat White is still visible (in product grid and/or cart) — use first() to avoid strict mode
    await page.getByText('Flat White').first().waitFor({ state: 'visible' });
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
