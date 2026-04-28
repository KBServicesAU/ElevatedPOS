import { test, expect, request } from '@playwright/test';

/**
 * Prod smoke test (v2.7.61).
 *
 * Runs against the live production endpoints AFTER the Helm deploy
 * finishes (deploy-production.yml). The goal isn't deep correctness —
 * it's "did this deploy take down something obvious before customers
 * find out". If any of these assertions fail the deploy job exits
 * non-zero and PagerDuty / SNS / Slack should already be screaming.
 *
 * Targeted checks:
 *   1. ALB / ingress responds at all (no DNS/cert/LB regression).
 *   2. The dashboard's login page renders (web-backoffice up, JS bundle
 *      loaded, CSS not 404'ing).
 *   3. The proxy → auth `/health` round-trip returns 200 (web-backoffice
 *      can talk to auth in-cluster, secrets resolved correctly).
 *   4. A handful of public-but-unauthenticated catalog/orders endpoints
 *      respond with their expected `401` (proves the route is wired and
 *      auth middleware is on the right side of healthy).
 *
 * This deliberately does NOT log in. We don't want test creds rolled
 * into prod's audit log on every deploy and a leaked test account is
 * one more attack surface. Login + transaction smoke is exercised
 * separately on staging where we already have docker-compose tests.
 *
 * Skip with `E2E_SKIP_PROD_SMOKE=true` for emergency deploys.
 */

const BASE = process.env['PROD_BASE_URL']      ?? 'https://app.elevatedpos.com.au';
const API  = process.env['PROD_API_BASE_URL']  ?? 'https://api.elevatedpos.com.au';
const SKIP = process.env['E2E_SKIP_PROD_SMOKE'] === 'true';

test.describe.configure({ mode: 'serial' });

test.skip(SKIP, 'E2E_SKIP_PROD_SMOKE=true — skipping prod smoke');

test('ALB / ingress responds', async () => {
  const ctx = await request.newContext();
  const res = await ctx.get(BASE, { failOnStatusCode: false });
  // Either the dashboard renders (200) or it redirects to /login (302).
  // Anything else (502, 503, certificate error → no response) is bad.
  expect([200, 302, 307, 308]).toContain(res.status());
});

test('dashboard login page renders', async ({ page }) => {
  await page.goto(`${BASE}/login`);
  // The login form should be present.
  await expect(page.getByPlaceholder(/you@yourstore\.com/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
});

test('auth service health via proxy', async () => {
  const ctx = await request.newContext();
  // The /api/proxy/* routes ride the same Next.js host as the dashboard;
  // hitting `auth/health` here proves web-backoffice → auth in-cluster
  // works and that the rotated secrets are wired correctly.
  const res = await ctx.get(`${BASE}/api/proxy/auth/health`, { failOnStatusCode: false });
  expect(res.ok()).toBeTruthy();
});

test('catalog public endpoint requires auth (proves route wired)', async () => {
  const ctx = await request.newContext();
  // GET /api/v1/products without a Bearer token should return 401, not 502.
  // 401 means the service is up + auth middleware is intercepting.
  // 502/503 would mean the catalog service is down / not reachable.
  const res = await ctx.get(`${API}/api/v1/products`, { failOnStatusCode: false });
  expect([401, 403]).toContain(res.status());
});

test('orders public endpoint requires auth', async () => {
  const ctx = await request.newContext();
  const res = await ctx.get(`${API}/api/v1/orders`, { failOnStatusCode: false });
  expect([401, 403]).toContain(res.status());
});

test('integrations connect endpoint requires auth', async () => {
  const ctx = await request.newContext();
  const res = await ctx.post(`${API}/api/v1/connect/account-session`, {
    failOnStatusCode: false,
    data: {}, // trailing body so we don't trip the v2.7.56 empty-body 400 we just patched
  });
  expect([401, 403]).toContain(res.status());
});
