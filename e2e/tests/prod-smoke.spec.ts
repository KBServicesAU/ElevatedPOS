import { test, expect, request } from '@playwright/test';

/**
 * Prod smoke test (v2.7.61, retuned in v2.7.64).
 *
 * Runs against the live production endpoints AFTER the Helm deploy
 * finishes (deploy-production.yml). The goal isn't deep correctness —
 * it's "did this deploy take down something obvious before customers
 * find out". If any of these assertions fail the deploy job exits
 * non-zero and PagerDuty / SNS / Slack should already be screaming.
 *
 * v2.7.64 retune: the original draft assumed endpoints that don't
 * exist on the prod ingress — `/health` 404s, `/api/v1/products`
 * 404s, and the dashboard proxy doesn't have an `auth` entry in its
 * SERVICE_MAP so `/api/proxy/auth/health` 404s as well. Replaced with
 * endpoints that actually returned the expected codes when probed
 * manually:
 *   - api.elevatedpos.com.au/api/v1/orders            → 401
 *   - api.elevatedpos.com.au/api/v1/customers         → 401
 *   - api.elevatedpos.com.au/api/v1/payments          → 401
 *   - api.elevatedpos.com.au/api/v1/locations         → 401 (auth-backed)
 *   - app.elevatedpos.com.au/login                    → 200
 *   - app.elevatedpos.com.au/api/proxy/orders         → 307 (proxy alive)
 *
 * Skip with `E2E_SKIP_PROD_SMOKE=true` for emergency deploys.
 */

const BASE = process.env['PROD_BASE_URL']      ?? 'https://app.elevatedpos.com.au';
const API  = process.env['PROD_API_BASE_URL']  ?? 'https://api.elevatedpos.com.au';
const SKIP = process.env['E2E_SKIP_PROD_SMOKE'] === 'true';

test.describe.configure({ mode: 'serial' });

test.skip(SKIP, 'E2E_SKIP_PROD_SMOKE=true — skipping prod smoke');

test('dashboard ALB responds', async () => {
  const ctx = await request.newContext();
  const res = await ctx.get(BASE, { failOnStatusCode: false, maxRedirects: 0 });
  // Dashboard either renders (200) or sends to /login (3xx). Anything else
  // (502/503, cert errors, no response) means the public surface is broken.
  expect([200, 301, 302, 307, 308]).toContain(res.status());
});

test('dashboard login page renders', async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await expect(page.getByPlaceholder(/you@yourstore\.com/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
});

test('dashboard /api/proxy/* routes calls (proves web-backoffice -> service wired)', async () => {
  const ctx = await request.newContext();
  // /api/proxy/orders without a session cookie. apiFetch in the dashboard
  // catches the upstream 401 and redirects to /login (Next.js 307). The
  // important thing is we get a redirect, not a 502 — that proves the
  // proxy handler ran, looked up `orders` in SERVICE_MAP, forwarded to
  // the orders service, got a 401 back, and triggered the redirect.
  const res = await ctx.get(`${BASE}/api/proxy/orders`, {
    failOnStatusCode: false,
    maxRedirects: 0,
  });
  expect([301, 302, 307, 308, 401]).toContain(res.status());
});

test('orders service requires auth (proves it is up + middleware on)', async () => {
  const ctx = await request.newContext();
  const res = await ctx.get(`${API}/api/v1/orders`, { failOnStatusCode: false });
  // 401/403 means the service is up and rejecting unauthenticated requests.
  // 502/503 would mean the orders service is down or unreachable from the ingress.
  expect([401, 403]).toContain(res.status());
});

test('customers service requires auth', async () => {
  const ctx = await request.newContext();
  const res = await ctx.get(`${API}/api/v1/customers`, { failOnStatusCode: false });
  expect([401, 403]).toContain(res.status());
});

test('payments service requires auth', async () => {
  const ctx = await request.newContext();
  const res = await ctx.get(`${API}/api/v1/payments`, { failOnStatusCode: false });
  expect([401, 403]).toContain(res.status());
});

test('locations service requires auth (auth-service-backed)', async () => {
  const ctx = await request.newContext();
  // /api/v1/locations is served by the auth service. A 401 here proves
  // auth pods are running and the rotated secrets are wired (auth fails
  // closed if it can't decode JWTs but it returns 401 not 502 once it's
  // accepting connections).
  const res = await ctx.get(`${API}/api/v1/locations`, { failOnStatusCode: false });
  expect([401, 403]).toContain(res.status());
});
