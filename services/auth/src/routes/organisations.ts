import { type FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { hashPassword } from '../lib/tokens.js';
import { getFeatureFlagsForIndustry } from '../lib/industryFlags.js';

const industryValues = ['cafe', 'restaurant', 'bar', 'retail', 'fashion', 'grocery', 'salon', 'gym', 'services', 'barber', 'quick_service', 'other'] as const;
const onboardingSteps = ['industry_selected', 'location_setup', 'products_added', 'completed'] as const;

const NOTIFICATIONS_API_URL = process.env['NOTIFICATIONS_API_URL'] ?? 'http://localhost:4009';
const INTEGRATIONS_API_URL = process.env['INTEGRATIONS_API_URL'] ?? 'http://localhost:4010';
const APP_URL = process.env['APP_URL'] ?? 'https://app.elevatedpos.com.au';

export async function organisationRoutes(app: FastifyInstance) {
  // GET /organisations/me — returns core org info for the authenticated user's org
  app.get('/me', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, orgId),
    });
    if (!org) return reply.status(404).send({ error: 'Organisation not found' });
    return reply.send({
      id: org.id,
      slug: org.slug,
      name: org.name,
      accountNumber: org.accountNumber ?? null,
      industry: org.industry ?? null,
      featureFlags: (org.featureFlags as Record<string, boolean> | null) ?? null,
      billingModel: org.billingModel ?? 'legacy',
    });
  });

  // ── Receipt settings ───────────────────────────────────────────────────────
  //
  // GET / PATCH /api/v1/organisations/me/receipt-settings
  //
  // Stored on the organisations.receipt_settings JSONB column.  Initial
  // shape is `{ showOrderNumber: boolean }` (default true) but the column
  // is intentionally a JSONB blob so future fields (logo position, footer
  // toggles, paper-width hints, etc.) can be added without a migration.
  //
  // PATCH merges the body into the current value, so callers can send a
  // single key without losing other settings. Unknown keys are dropped
  // by the Zod whitelist below.

  /** Default values applied when a key has never been written. */
  const DEFAULT_RECEIPT_SETTINGS = {
    showOrderNumber: true,
    /**
     * v2.7.48 — base64-encoded 1-bit raster of the merchant logo, generated
     * client-side by the dashboard at upload time so the mobile POS doesn't
     * need a PNG decoder. `null` means no logo. Stored alongside dimensions
     * so the printer can emit the exact GS v 0 command without re-parsing.
     */
    logoBase64: null as string | null,
    logoWidth: null as number | null,
    logoHeight: null as number | null,
  };

  /**
   * Sanity cap on stored logo size. Auth-service Fastify default body limit
   * is 1 MiB; a 384 × 1000-pixel 1-bit raster is 48000 bytes raw / ~64000 base64,
   * comfortably under. We hard-stop anything larger so a malicious client can't
   * fill the receipt_settings JSONB column with megabytes of base64 noise.
   *
   * v2.7.51 — raised from 256 KiB to 1 MiB to accommodate larger source PNGs
   * the dashboard rasteriser produces for some merchant logos before the
   * 384×240 cap kicks in. The strict server-side cap stays as a safety net.
   */
  const MAX_LOGO_BYTES = 1024 * 1024; // 1 MiB after base64

  /** Merge stored value with defaults, dropping unknown keys for safety. */
  function readReceiptSettings(raw: unknown): typeof DEFAULT_RECEIPT_SETTINGS {
    const stored = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    return {
      showOrderNumber: typeof stored['showOrderNumber'] === 'boolean'
        ? (stored['showOrderNumber'] as boolean)
        : DEFAULT_RECEIPT_SETTINGS.showOrderNumber,
      logoBase64: typeof stored['logoBase64'] === 'string' && (stored['logoBase64'] as string).length > 0
        ? (stored['logoBase64'] as string)
        : null,
      logoWidth: typeof stored['logoWidth'] === 'number' ? (stored['logoWidth'] as number) : null,
      logoHeight: typeof stored['logoHeight'] === 'number' ? (stored['logoHeight'] as number) : null,
    };
  }

  app.get('/me/receipt-settings', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, orgId),
      columns: { receiptSettings: true },
    });
    if (!org) return reply.status(404).send({ error: 'Organisation not found' });
    return reply.send(readReceiptSettings(org.receiptSettings));
  });

  app.patch('/me/receipt-settings', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    // v2.7.51 — diagnostic instrumentation. Merchants reported "Save failed"
    // toasts after uploading a logo; surface size + first-100-char preview of
    // the body and the actual reason for any rejection so log-triage doesn't
    // need a repro. Body is base64 only — no PII.
    try {
      const rawSize = JSON.stringify(request.body ?? {}).length;
      const preview = JSON.stringify(request.body ?? {}).slice(0, 100);
      const logoLen = (request.body as { logoBase64?: string | null } | undefined)?.logoBase64?.length ?? 0;
      console.log('[receipt-settings PATCH] orgId=', orgId, 'bodySize=', rawSize, 'logoBase64.length=', logoLen, 'preview=', preview);
    } catch {
      /* best-effort logging only */
    }

    // v2.7.48 — `logoBase64` may be `null` to clear, or a non-empty string
    // (the pre-rasterised 1-bit bitmap from the dashboard). Width/height
    // are only meaningful when the logo is set; they're cleared together
    // when the logo is removed.
    const parsed = z.object({
      showOrderNumber: z.boolean().optional(),
      logoBase64: z.string().nullable().optional(),
      logoWidth: z.number().int().positive().nullable().optional(),
      logoHeight: z.number().int().positive().nullable().optional(),
    }).strict().safeParse(request.body);

    if (!parsed.success) {
      console.warn('[receipt-settings PATCH] zod validation failed:', parsed.error.flatten());
      return reply.status(400).send({
        error: 'Invalid receipt settings body',
        details: parsed.error.flatten(),
      });
    }

    // Reject oversize logos before they hit the JSONB column. v2.7.51 — return
    // a human-readable reason so the dashboard toast can show "Logo too large"
    // instead of a generic "Please try again".
    if (parsed.data.logoBase64 && parsed.data.logoBase64.length > MAX_LOGO_BYTES) {
      const sizeKb = Math.round(parsed.data.logoBase64.length / 1024);
      const maxKb = Math.round(MAX_LOGO_BYTES / 1024);
      console.warn('[receipt-settings PATCH] logo rejected — size', sizeKb, 'KiB > limit', maxKb, 'KiB');
      return reply.status(413).send({
        error: `Logo too large (${sizeKb} KiB) — maximum is ${maxKb} KiB. Try a smaller source image.`,
        maxBytes: MAX_LOGO_BYTES,
        actualBytes: parsed.data.logoBase64.length,
      });
    }

    try {
      const existing = await db.query.organisations.findFirst({
        where: eq(schema.organisations.id, orgId),
        columns: { receiptSettings: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Organisation not found' });

      const current = (existing.receiptSettings && typeof existing.receiptSettings === 'object')
        ? existing.receiptSettings as Record<string, unknown>
        : {};
      const merged: Record<string, unknown> = { ...current, ...parsed.data };

      // If the caller cleared the logo, also clear its dimensions so the
      // mobile renderer doesn't try to read stale w×h with a null base64.
      if (parsed.data.logoBase64 === null) {
        merged['logoWidth'] = null;
        merged['logoHeight'] = null;
      }

      await db.update(schema.organisations)
        .set({ receiptSettings: merged, updatedAt: new Date() })
        .where(eq(schema.organisations.id, orgId));

      console.log('[receipt-settings PATCH] saved successfully for orgId=', orgId);
      return reply.send(readReceiptSettings(merged));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[receipt-settings PATCH] DB write failed:', message);
      return reply.status(500).send({
        error: `Could not persist receipt settings: ${message}`,
      });
    }
  });

  // ── Web-store settings (v2.7.51-F2) ───────────────────────────────────────
  //
  // Drives the customer-facing site at site.elevatedpos.com.au/<slug>.
  //
  // Stored on organisations.settings.webStore (a JSONB sub-key on the existing
  // settings column) so we don't need a schema migration. Industry-aware: the
  // dashboard hides sections that don't apply (no Reservations toggle in retail,
  // no Shipping settings in hospitality).
  //
  // GET /organisations/me/web-store          — authenticated, returns merchant's settings
  // PATCH /organisations/me/web-store        — authenticated, partial update
  // GET /organisations/by-slug/:slug         — public, returns org + webStore for storefront

  type WebStoreSettings = {
    enabled: boolean;
    theme: 'minimal' | 'modern' | 'warm' | 'classic';
    description: string | null;
    primaryColor: string | null;
    logoUrl: string | null;
    // Hospitality
    onlineOrderingEnabled: boolean;
    reservationsEnabled: boolean;
    // Services
    bookingsEnabled: boolean;
    bookingServices: { name: string; durationMinutes: number; priceCents: number }[];
    // Retail
    inventorySync: boolean;
    shippingFlatRateCents: number | null;
  };

  const DEFAULT_WEB_STORE: WebStoreSettings = {
    enabled: false,
    theme: 'minimal',
    description: null,
    primaryColor: null,
    logoUrl: null,
    onlineOrderingEnabled: false,
    reservationsEnabled: false,
    bookingsEnabled: false,
    bookingServices: [],
    inventorySync: true,
    shippingFlatRateCents: null,
  };

  function readWebStoreSettings(rawSettings: unknown): WebStoreSettings {
    const settings = (rawSettings && typeof rawSettings === 'object') ? rawSettings as Record<string, unknown> : {};
    const raw = settings['webStore'];
    const stored = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const themeValue = stored['theme'];
    const theme: WebStoreSettings['theme'] =
      themeValue === 'modern' || themeValue === 'warm' || themeValue === 'classic' || themeValue === 'minimal'
        ? themeValue
        : DEFAULT_WEB_STORE.theme;
    const services = Array.isArray(stored['bookingServices'])
      ? (stored['bookingServices'] as unknown[]).filter((s): s is WebStoreSettings['bookingServices'][number] => {
          if (!s || typeof s !== 'object') return false;
          const sv = s as Record<string, unknown>;
          return typeof sv['name'] === 'string'
            && typeof sv['durationMinutes'] === 'number'
            && typeof sv['priceCents'] === 'number';
        })
      : DEFAULT_WEB_STORE.bookingServices;
    return {
      enabled: typeof stored['enabled'] === 'boolean' ? stored['enabled'] as boolean : DEFAULT_WEB_STORE.enabled,
      theme,
      description: typeof stored['description'] === 'string' ? stored['description'] as string : DEFAULT_WEB_STORE.description,
      primaryColor: typeof stored['primaryColor'] === 'string' ? stored['primaryColor'] as string : DEFAULT_WEB_STORE.primaryColor,
      logoUrl: typeof stored['logoUrl'] === 'string' ? stored['logoUrl'] as string : DEFAULT_WEB_STORE.logoUrl,
      onlineOrderingEnabled: typeof stored['onlineOrderingEnabled'] === 'boolean' ? stored['onlineOrderingEnabled'] as boolean : DEFAULT_WEB_STORE.onlineOrderingEnabled,
      reservationsEnabled: typeof stored['reservationsEnabled'] === 'boolean' ? stored['reservationsEnabled'] as boolean : DEFAULT_WEB_STORE.reservationsEnabled,
      bookingsEnabled: typeof stored['bookingsEnabled'] === 'boolean' ? stored['bookingsEnabled'] as boolean : DEFAULT_WEB_STORE.bookingsEnabled,
      bookingServices: services,
      inventorySync: typeof stored['inventorySync'] === 'boolean' ? stored['inventorySync'] as boolean : DEFAULT_WEB_STORE.inventorySync,
      shippingFlatRateCents: typeof stored['shippingFlatRateCents'] === 'number' ? stored['shippingFlatRateCents'] as number : DEFAULT_WEB_STORE.shippingFlatRateCents,
    };
  }

  app.get('/me/web-store', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, orgId),
      columns: { settings: true, slug: true, name: true, industry: true },
    });
    if (!org) return reply.status(404).send({ error: 'Organisation not found' });
    return reply.send({
      slug: org.slug,
      businessName: org.name,
      industry: org.industry,
      previewUrl: `https://site.elevatedpos.com.au/${org.slug}`,
      ...readWebStoreSettings(org.settings),
    });
  });

  app.patch('/me/web-store', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const bookingServiceSchema = z.object({
      name: z.string().min(1).max(100),
      durationMinutes: z.number().int().positive().max(1440),
      priceCents: z.number().int().nonnegative(),
    });

    const parsed = z.object({
      enabled: z.boolean().optional(),
      theme: z.enum(['minimal', 'modern', 'warm', 'classic']).optional(),
      description: z.string().max(2000).nullable().optional(),
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
      logoUrl: z.string().url().nullable().optional(),
      onlineOrderingEnabled: z.boolean().optional(),
      reservationsEnabled: z.boolean().optional(),
      bookingsEnabled: z.boolean().optional(),
      bookingServices: z.array(bookingServiceSchema).max(50).optional(),
      inventorySync: z.boolean().optional(),
      shippingFlatRateCents: z.number().int().nonnegative().nullable().optional(),
    }).strict().safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const existing = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, orgId),
      columns: { settings: true },
    });
    if (!existing) return reply.status(404).send({ error: 'Organisation not found' });

    const currentSettings = (existing.settings && typeof existing.settings === 'object')
      ? existing.settings as Record<string, unknown>
      : {};
    const currentWebStore = readWebStoreSettings(currentSettings);
    // Strip undefined keys so each `optional()` field doesn't clobber the
    // current value with `undefined` when the caller didn't include it.
    const patch: Partial<WebStoreSettings> = {};
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) (patch as Record<string, unknown>)[k] = v;
    }
    const mergedWebStore: WebStoreSettings = { ...currentWebStore, ...patch };
    const newSettings: Record<string, unknown> = { ...currentSettings, webStore: mergedWebStore };

    await db.update(schema.organisations)
      .set({ settings: newSettings, updatedAt: new Date() })
      .where(eq(schema.organisations.id, orgId));

    return reply.send(mergedWebStore);
  });

  // GET /organisations/by-slug/:slug — public, no auth required
  app.get('/by-slug/:slug', { config: { skipAuth: true } }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.slug, slug),
    });
    if (!org) return reply.status(404).send({ error: 'Organisation not found' });
    return reply.send({
      id: org.id,
      name: org.name,
      slug: org.slug,
      industry: org.industry ?? null,
      country: org.country,
      currency: org.currency,
      timezone: org.timezone,
      webStore: readWebStoreSettings(org.settings),
    });
  });

  // POST /api/v1/organisations/register — public, no auth required
  // Creates a new org + owner employee account in one transaction
  app.post('/register', {
    config: { skipAuth: true },
    schema: {
      body: {
        type: 'object',
        required: ['businessName', 'email', 'password', 'firstName', 'lastName'],
        properties: {
          businessName: { type: 'string', minLength: 2, maxLength: 100 },
          email:        { type: 'string', format: 'email' },
          password:     { type: 'string', minLength: 8 },
          firstName:    { type: 'string', minLength: 1, maxLength: 50 },
          lastName:     { type: 'string', minLength: 1, maxLength: 50 },
          phone:        { type: 'string' },
          abn:          { type: 'string' },
          plan:         { type: 'string', enum: ['starter', 'growth', 'enterprise'], default: 'starter' },
          industry:     { type: 'string', enum: ['cafe', 'restaurant', 'bar', 'retail', 'fashion', 'grocery', 'salon', 'gym', 'services', 'other'] },
        },
      },
    },
  }, async (request, reply) => {
    const { businessName, email: rawEmail, password, firstName, lastName, abn, plan = 'starter', industry } = request.body as {
      businessName: string; email: string; password: string;
      firstName: string; lastName: string; phone?: string; abn?: string; plan?: string;
      industry?: string;
    };

    // v2.7.51 — normalise email at write time so the case-insensitive lookup
    // in /login (which already does email.toLowerCase()) actually finds the
    // employee row. Without this, signing up with "Jane@Acme.com" creates
    // an employee row with that mixed-case email, and login (which lowercases
    // its query input) can never match it. Manifests to the user as the
    // ever-present "Email or password is incorrect" with correct details.
    const email = rawEmail.trim().toLowerCase();

    // Plan limits
    const planLimits: Record<string, { maxLocations: number; maxDevices: number }> = {
      starter:    { maxLocations: 1,    maxDevices: 2    },
      growth:     { maxLocations: 3,    maxDevices: 10   },
      enterprise: { maxLocations: 9999, maxDevices: 9999 },
    };
    const limits = planLimits[plan] ?? planLimits['starter']!;

    const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50);
    const passwordHash = await hashPassword(password);

    const verificationToken = randomBytes(32).toString('hex');

    try {
      const result = await db.transaction(async (tx) => {
        const [org] = await tx.insert(schema.organisations).values({
          name: businessName,
          slug: `${slug}-${Date.now()}`,
          plan: plan as 'starter' | 'growth' | 'pro' | 'enterprise' | 'custom',
          maxLocations: limits.maxLocations,
          maxDevices: limits.maxDevices,
          abn: abn ?? null,
          billingEmail: email,
          // v2.7.44 — industry is now NOT NULL (default 'retail') so the
          // hospitality order-type picker can branch on it without nulls.
          // If the caller didn't pick one yet (pre-onboarding flow), we
          // store 'retail' as the safe default until they choose.
          industry: industry ?? 'retail',
          onboardingStep: industry ? 'industry_selected' : 'account_created',
        }).returning();

        const [employee] = await tx.insert(schema.employees).values({
          orgId: org!.id,
          email,
          passwordHash,
          firstName,
          lastName,
          isActive: true,
        }).returning();

        await tx.update(schema.employees)
          .set({
            emailVerificationToken: verificationToken,
            emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          })
          .where(eq(schema.employees.id, employee!.id));

        return { org: org!, employee: employee! };
      });

      // Fire-and-forget: send verification email via notifications service
      // We sign a short-lived internal token so the notifications service accepts the call
      const internalToken = app.jwt.sign(
        { sub: result.employee.id, orgId: result.org.id, role: 'system' },
        { expiresIn: '5m' },
      );

      const verifyUrl = `${APP_URL}/verify-email?token=${verificationToken}&emp=${result.employee.id}`;

      const verificationHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#f0f0f2;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .shell{max-width:620px;margin:40px auto 60px;padding:0 16px}
  .card{background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .header{background:#09090b;padding:32px 40px;text-align:center}
  .logo-ring{display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:#ffffff;border-radius:14px}
  .logo-ring span{font-size:30px;font-weight:900;color:#09090b;font-family:Georgia,serif}
  .brand-name{color:#ffffff;font-size:16px;font-weight:600;letter-spacing:.6px;margin-top:10px;opacity:.85}
  .body{padding:40px 40px 32px}
  h1{color:#09090b;font-size:22px;font-weight:700;line-height:1.3;margin-bottom:12px}
  p{color:#52525b;font-size:15px;line-height:1.75;margin-bottom:16px}
  strong{color:#18181b}
  .info-box{background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:16px 20px;margin:20px 0}
  .info-box p{margin-bottom:6px;font-size:14px}
  .info-box p:last-child{margin-bottom:0}
  .btn-wrap{text-align:center;margin:28px 0 24px}
  .btn{display:inline-block;background:#09090b;color:#ffffff!important;font-size:15px;font-weight:600;padding:14px 36px;border-radius:10px;text-decoration:none}
  .divider{border:none;border-top:1px solid #f4f4f5;margin:24px 0}
  .small{font-size:13px;color:#a1a1aa;line-height:1.6}
  .small a{color:#71717a;text-decoration:underline;word-break:break-all}
  .footer{padding:20px 40px 28px;text-align:center;background:#fafafa;border-top:1px solid #f4f4f5}
  .footer p{font-size:12px;color:#a1a1aa;line-height:1.8;margin:0}
  .footer a{color:#71717a;text-decoration:none}
</style>
</head>
<body>
<div class="shell">
  <div class="card">
    <div class="header">
      <div class="logo-ring"><span>E</span></div>
      <div class="brand-name">ElevatedPOS</div>
    </div>
    <div class="body">
      <h1>You're almost in, ${firstName}! 👋</h1>
      <p>Thanks for signing up for <strong>ElevatedPOS</strong>. Before you start setting up your store, please verify your email address so we know it's really you.</p>
      <div class="btn-wrap">
        <a href="${verifyUrl}" class="btn">Verify My Email &rarr;</a>
      </div>
      <div class="info-box">
        <p><strong>Business:</strong> ${businessName}</p>
        <p><strong>Plan:</strong> ${plan.charAt(0).toUpperCase() + plan.slice(1)}</p>
      </div>
      <p>Once verified you'll have full access to your dashboard where you can add your location, set up your products, invite staff, and start taking payments.</p>
      <hr class="divider">
      <p class="small">This link expires in <strong>24 hours</strong>. If you didn't create an ElevatedPOS account, you can safely ignore this email.</p>
      <p class="small">Button not working? Copy and paste this URL into your browser:<br><a href="${verifyUrl}">${verifyUrl}</a></p>
    </div>
    <div class="footer">
      <p><strong style="color:#71717a">ElevatedPOS</strong> &mdash; Point of Sale &amp; Business Management</p>
      <p style="margin-top:4px">Questions? <a href="mailto:support@elevatedpos.com.au">support@elevatedpos.com.au</a></p>
    </div>
  </div>
</div>
</body>
</html>`;

      // v2.7.51 — the notifications service /email endpoint requires
      // a `template` field (one of receipt/layby_statement/gift_card/
      // campaign/roster/pickup_ready/custom). Sending only `htmlBody`
      // returns a 422 Validation Error and the welcome email never
      // arrives. Use the `custom` template, which renders the body
      // string as-is.
      fetch(`${NOTIFICATIONS_API_URL}/api/v1/notifications/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalToken}` },
        body: JSON.stringify({
          to: result.employee.email,
          subject: `Welcome to ElevatedPOS — verify your email, ${firstName}!`,
          template: 'custom',
          orgId: result.org.id,
          data: { body: verificationHtml },
        }),
      }).catch((err: unknown) => {
        console.error('[organisations/register] failed to send verification email', err instanceof Error ? err.message : String(err));
      });

      // Fire-and-forget: create Stripe Connect Express account for the merchant
      fetch(`${INTEGRATIONS_API_URL}/api/v1/connect/platform-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: result.org.id,
          email: result.employee.email,
          businessName,
          returnUrl: `${APP_URL}/onboard/subscription`,
          refreshUrl: `${APP_URL}/onboard/payment-account`,
        }),
      }).catch((err: unknown) => {
        console.error('[organisations/register] failed to create Stripe Connect account', err instanceof Error ? err.message : String(err));
      });

      // v2.7.51 — issue a real auth JWT for the new owner so the storefront
      // can call authenticated endpoints (Stripe Connect onboarding,
      // /api/v1/billing/setup, etc.) for the rest of the wizard. Without this,
      // /onboard/connect-payments hits the integrations service unauthenticated
      // and the route silently falls back to "skip Stripe" — which is exactly
      // why the merchant saw "Payment account connected successfully!" without
      // any Stripe redirect.
      const onboardingToken = app.jwt.sign({
        sub: result.employee.id,
        orgId: result.org.id,
        roleId: null,
        permissions: {},
        locationIds: [],
        name: `${firstName} ${lastName}`,
        email: result.employee.email,
      });

      return reply.status(201).send({
        orgId: result.org.id,
        employeeId: result.employee.id,
        email: result.employee.email,
        businessName: result.org.name,
        plan: result.org.plan,
        onboardingStep: result.org.onboardingStep,
        token: onboardingToken,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('unique') || message.includes('duplicate')) {
        return reply.status(409).send({ error: 'An account with this email already exists' });
      }
      throw err;
    }
  });

  // ── Onboarding ───────────────────────────────────────────────────────────────

  const updateOnboardingSchema = z.object({
    step: z.enum(onboardingSteps),
    industry: z.enum(industryValues).optional(),
  });

  // GET /api/v1/organisations/onboarding — returns current onboarding status
  app.get('/onboarding', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, orgId),
    });

    if (!org) return reply.status(404).send({ error: 'Organisation not found' });

    return reply.send({
      step: org.onboardingStep,
      industry: org.industry ?? null,
      completedAt: org.onboardingCompletedAt ?? null,
      featureFlags: (org.featureFlags as Record<string, boolean> | null) ?? null,
      billingModel: org.billingModel ?? 'legacy',
    });
  });

  // POST / PATCH /api/v1/organisations/onboarding — advance onboarding step.
  //
  // Historically defined as PATCH only, but the web-backoffice setup flow
  // (app/setup/page.tsx, setup/location/page.tsx, setup/products/page.tsx,
  // setup/complete/page.tsx) sends POST. Deployed frontends in the wild
  // call POST, so we accept both verbs here to avoid breaking onboarding
  // for existing users. Long-term, pick one verb in the frontend and drop
  // the other; for now both share one handler.
  app.route({
    method: ['PATCH', 'POST'],
    url: '/onboarding',
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { orgId } = request.user as { orgId: string };

      const parsed = updateOnboardingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
      }

      const { step, industry } = parsed.data;

      const updates: Record<string, unknown> = {
        onboardingStep: step,
        updatedAt: new Date(),
      };

      if (industry) {
        updates['industry'] = industry;
      }

      if (step === 'completed') {
        updates['onboardingCompletedAt'] = new Date();
      }

      const [updated] = await db.update(schema.organisations)
        .set(updates)
        .where(eq(schema.organisations.id, orgId))
        .returning();

      if (!updated) return reply.status(404).send({ error: 'Organisation not found' });

      return reply.send({
        step: updated.onboardingStep,
        industry: updated.industry ?? null,
        completedAt: updated.onboardingCompletedAt ?? null,
      });
    },
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 7-STEP MANDATORY ONBOARDING  (pre-login, session-token secured)
  // ══════════════════════════════════════════════════════════════════════════════
  //
  // Each step returns an `onboardingToken` (short-lived JWT, 60 min) that gates
  // the next step.  The final step issues a full auth JWT so the user is logged in.
  // This entire flow happens BEFORE the user has a password JWT (pre-login).

  function signOnboardingToken(orgId: string, nextStep: string): string {
    return app.jwt.sign(
      { sub: orgId, orgId, type: 'onboarding', nextStep },
      { expiresIn: '60m' },
    );
  }

  function verifyOnboardingToken(request: import('fastify').FastifyRequest): { orgId: string; nextStep: string } | null {
    const auth = request.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) return null;
    try {
      const decoded = app.jwt.verify<{ orgId: string; type: string; nextStep: string }>(auth.slice(7));
      if (decoded.type !== 'onboarding') return null;
      return { orgId: decoded.orgId, nextStep: decoded.nextStep };
    } catch {
      return null;
    }
  }

  // ── STEP 1: Business Info ─────────────────────────────────────────────────
  // Creates the org skeleton. Returns an onboarding token to gate step 2.
  app.post('/onboard/start', { config: { skipAuth: true } }, async (request, reply) => {
    const body = z.object({
      businessName:    z.string().min(2).max(100),
      abn:             z.string().min(11).max(11),
      phone:           z.string().min(8).max(20),
      businessAddress: z.object({
        street:   z.string().min(1),
        suburb:   z.string().min(1),
        state:    z.string().min(2).max(3),
        postcode: z.string().min(4).max(4),
        country:  z.string().default('AU'),
      }),
      websiteUrl:      z.string().url().optional().or(z.literal('')),
      industry:        z.enum(industryValues),
      billingEmail:    z.string().email(),
      refCode:         z.string().optional(), // signup link referral code
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation failed', issues: body.error.issues });
    const d = body.data;

    // Validate referral code if provided
    let refLink: typeof schema.signupLinks.$inferSelect | undefined;
    if (d.refCode) {
      refLink = await db.query.signupLinks.findFirst({
        where: eq(schema.signupLinks.code, d.refCode),
      });
      if (!refLink || !refLink.isActive || (refLink.expiresAt && refLink.expiresAt < new Date()) || refLink.usedAt) {
        return reply.status(400).send({ error: 'Invalid or expired referral code' });
      }
    }

    const featureFlags = getFeatureFlagsForIndustry(d.industry);
    const slug = d.businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50);

    const [org] = await db.insert(schema.organisations).values({
      name: d.businessName,
      slug: `${slug}-${Date.now()}`,
      abn: d.abn,
      phone: d.phone,
      businessAddress: d.businessAddress,
      websiteUrl: d.websiteUrl ?? null,
      industry: d.industry,
      billingEmail: d.billingEmail,
      featureFlags,
      billingModel: 'per_device',
      subscriptionStatus: 'incomplete',
      onboardingStepV2: 'business_info',
      onboardingStep: 'account_created', // legacy compat
    }).returning();

    if (!org) throw new Error('Failed to create organisation');

    // Mark referral code if used
    if (refLink) {
      await db.update(schema.signupLinks)
        .set({ usedAt: new Date(), usedByOrgId: org.id })
        .where(eq(schema.signupLinks.id, refLink.id));
    }

    const token = signOnboardingToken(org.id, 'owner_account');
    return reply.status(201).send({ orgId: org.id, onboardingToken: token, nextStep: 'owner_account' });
  });

  // ── STEP 2: Owner Account ─────────────────────────────────────────────────
  app.post('/onboard/owner', { config: { skipAuth: true } }, async (request, reply) => {
    const session = verifyOnboardingToken(request);
    if (!session) return reply.status(401).send({ error: 'Invalid or expired onboarding session' });

    const body = z.object({
      firstName:       z.string().min(1).max(50),
      lastName:        z.string().min(1).max(50),
      email:           z.string().email(),
      password:        z.string().min(8),
      confirmPassword: z.string(),
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation failed', issues: body.error.issues });
    const d = body.data;
    if (d.password !== d.confirmPassword) return reply.status(400).send({ error: 'Passwords do not match' });

    // v2.7.51 — normalise email at write time. /login lowercases its lookup.
    const normalisedEmail = d.email.trim().toLowerCase();

    const passwordHash = await hashPassword(d.password);
    const verificationToken = randomBytes(32).toString('hex');

    try {
      const [employee] = await db.insert(schema.employees).values({
        orgId: session.orgId,
        firstName: d.firstName,
        lastName: d.lastName,
        email: normalisedEmail,
        passwordHash,
        isActive: true,
        emailVerificationToken: verificationToken,
        emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }).returning();

      await db.update(schema.organisations)
        .set({ billingEmail: normalisedEmail, onboardingStepV2: 'owner_account', updatedAt: new Date() })
        .where(eq(schema.organisations.id, session.orgId));

      // Fire-and-forget: send welcome + verify email
      const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, session.orgId) });
      const verifyUrl = `${APP_URL}/verify-email?token=${verificationToken}&emp=${employee!.id}`;
      const internalToken = app.jwt.sign({ sub: employee!.id, orgId: session.orgId, role: 'system' }, { expiresIn: '5m' });
      // v2.7.51 — see note in /register: the email service requires the
      // `template` field. Use 'custom' with a body data field.
      fetch(`${NOTIFICATIONS_API_URL}/api/v1/notifications/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalToken}` },
        body: JSON.stringify({
          to: normalisedEmail,
          subject: `Welcome to ElevatedPOS — verify your email, ${d.firstName}!`,
          template: 'custom',
          orgId: session.orgId,
          data: { body: buildWelcomeEmail(d.firstName, org?.name ?? '', verifyUrl) },
        }),
      }).catch(() => {});

      const token = signOnboardingToken(session.orgId, 'location_setup');
      return reply.send({ onboardingToken: token, nextStep: 'location_setup' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('unique') || msg.includes('duplicate')) return reply.status(409).send({ error: 'Email already in use' });
      throw err;
    }
  });

  // ── STEP 3: Location Setup ────────────────────────────────────────────────
  app.post('/onboard/location', { config: { skipAuth: true } }, async (request, reply) => {
    const session = verifyOnboardingToken(request);
    if (!session) return reply.status(401).send({ error: 'Invalid or expired onboarding session' });

    const body = z.object({
      name:     z.string().min(1).max(255),
      address:  z.string().min(1),
      suburb:   z.string().min(1),
      state:    z.string().min(2).max(3),
      postcode: z.string().min(4).max(4),
      phone:    z.string().optional(),
      timezone: z.string().default('Australia/Sydney'),
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation failed', issues: body.error.issues });
    const d = body.data;

    await db.insert(schema.locations).values({
      orgId: session.orgId,
      name: d.name,
      address: { street: d.address, suburb: d.suburb, state: d.state, postcode: d.postcode, country: 'AU' },
      phone: d.phone ?? null,
      timezone: d.timezone,
      isActive: true,
    });

    await db.update(schema.organisations)
      .set({ onboardingStepV2: 'location_setup', updatedAt: new Date() })
      .where(eq(schema.organisations.id, session.orgId));

    const token = signOnboardingToken(session.orgId, 'staff_setup');
    return reply.send({ onboardingToken: token, nextStep: 'staff_setup' });
  });

  // ── STEP 4: Staff Setup ───────────────────────────────────────────────────
  app.post('/onboard/staff', { config: { skipAuth: true } }, async (request, reply) => {
    const session = verifyOnboardingToken(request);
    if (!session) return reply.status(401).send({ error: 'Invalid or expired onboarding session' });

    const body = z.object({
      staff: z.array(z.object({
        firstName: z.string().min(1).max(50),
        lastName:  z.string().min(1).max(50),
        email:     z.string().email(),
        role:      z.enum(['manager', 'cashier', 'staff']).default('staff'),
        pin:       z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
      })).min(1, 'At least one staff member is required'),
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation failed', issues: body.error.issues });

    for (const member of body.data.staff) {
      await db.insert(schema.employees).values({
        orgId: session.orgId,
        firstName: member.firstName,
        lastName: member.lastName,
        // v2.7.51 — lowercase to match /login lookup
        email: member.email.trim().toLowerCase(),
        pin: member.pin,
        isActive: true,
      }).onConflictDoNothing(); // skip if owner email re-entered
    }

    await db.update(schema.organisations)
      .set({ onboardingStepV2: 'staff_setup', updatedAt: new Date() })
      .where(eq(schema.organisations.id, session.orgId));

    const token = signOnboardingToken(session.orgId, 'device_selection');
    return reply.send({ onboardingToken: token, nextStep: 'device_selection' });
  });

  // ── STEP 5: Device Selection ──────────────────────────────────────────────
  app.post('/onboard/devices', { config: { skipAuth: true } }, async (request, reply) => {
    const session = verifyOnboardingToken(request);
    if (!session) return reply.status(401).send({ error: 'Invalid or expired onboarding session' });

    const body = z.object({
      pos:               z.number().int().min(0),
      kds:               z.number().int().min(0),
      kiosk:             z.number().int().min(0),
      display:           z.number().int().min(0),
      websiteAddon:      z.boolean().default(false),
      customDomainAddon: z.boolean().default(false),
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation failed', issues: body.error.issues });

    const { DEVICE_PRICE_CENTS, ADDON_PRICE_CENTS } = await import('./billing.js');
    const d = body.data;
    const monthlyTotal =
      d.pos * (DEVICE_PRICE_CENTS['pos'] ?? 0) +
      d.kds * (DEVICE_PRICE_CENTS['kds'] ?? 0) +
      d.kiosk * (DEVICE_PRICE_CENTS['kiosk'] ?? 0) +
      d.display * (DEVICE_PRICE_CENTS['display'] ?? 0) +
      (d.websiteAddon ? (ADDON_PRICE_CENTS['website'] ?? 0) : 0) +
      (d.customDomainAddon ? (ADDON_PRICE_CENTS['customDomain'] ?? 0) : 0);

    await db.update(schema.organisations)
      .set({
        pendingDeviceSelection: d,
        onboardingStepV2: 'device_selection',
        updatedAt: new Date(),
      })
      .where(eq(schema.organisations.id, session.orgId));

    const token = signOnboardingToken(session.orgId, 'stripe_connect');
    return reply.send({ onboardingToken: token, nextStep: 'stripe_connect', monthlyTotalCents: monthlyTotal });
  });

  // ── STEP 6: Stripe Connect Callback ──────────────────────────────────────
  // Called after Stripe Connect onboarding redirects the user back.
  // Frontend passes the onboarding token (stored in sessionStorage before redirect).
  app.post('/onboard/connect-complete', { config: { skipAuth: true } }, async (request, reply) => {
    const session = verifyOnboardingToken(request);
    if (!session) return reply.status(401).send({ error: 'Invalid or expired onboarding session' });

    await db.update(schema.organisations)
      .set({ onboardingStepV2: 'stripe_connect', updatedAt: new Date() })
      .where(eq(schema.organisations.id, session.orgId));

    const token = signOnboardingToken(session.orgId, 'subscription');
    return reply.send({ onboardingToken: token, nextStep: 'subscription' });
  });

  // ── STEP 7: Subscription Complete ────────────────────────────────────────
  // Called after the Stripe subscription PaymentElement confirms successfully.
  // Marks the org as fully onboarded and issues a full auth JWT.
  app.post('/onboard/complete', { config: { skipAuth: true } }, async (request, reply) => {
    const session = verifyOnboardingToken(request);
    if (!session) return reply.status(401).send({ error: 'Invalid or expired onboarding session' });

    await db.update(schema.organisations)
      .set({ onboardingStepV2: 'completed', onboardingStep: 'completed', onboardingCompletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.organisations.id, session.orgId));

    // Find the owner employee to issue a full auth JWT
    const owner = await db.query.employees.findFirst({
      where: eq(schema.employees.orgId, session.orgId),
      orderBy: (e, { asc }) => [asc(e.createdAt)],
    });
    if (!owner) return reply.status(404).send({ error: 'Owner account not found' });

    const authToken = app.jwt.sign(
      { sub: owner.id, orgId: session.orgId, role: 'owner', email: owner.email },
      { expiresIn: '8h' },
    );

    return reply.send({ token: authToken, orgId: session.orgId, employeeId: owner.id, onboardingComplete: true });
  });

  // ── GET /onboard/status ───────────────────────────────────────────────────
  // Lets the frontend check current onboarding step (e.g. after Stripe redirect).
  app.get('/onboard/status', { config: { skipAuth: true } }, async (request, reply) => {
    const session = verifyOnboardingToken(request);
    if (!session) return reply.status(401).send({ error: 'Invalid or expired onboarding session' });

    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, session.orgId),
    });
    if (!org) return reply.status(404).send({ error: 'Organisation not found' });

    return reply.send({
      orgId: org.id,
      onboardingStep: org.onboardingStepV2,
      industry: org.industry,
      featureFlags: org.featureFlags,
      pendingDeviceSelection: org.pendingDeviceSelection,
    });
  });
}

// ── Email template helper ──────────────────────────────────────────────────────

function buildWelcomeEmail(firstName: string, businessName: string, verifyUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#f0f0f2;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .shell{max-width:620px;margin:40px auto 60px;padding:0 16px}
  .card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .header{background:#09090b;padding:32px 40px;text-align:center}
  .logo-ring{display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:#fff;border-radius:14px}
  .logo-ring span{font-size:30px;font-weight:900;color:#09090b;font-family:Georgia,serif}
  .brand-name{color:#fff;font-size:16px;font-weight:600;letter-spacing:.6px;margin-top:10px;opacity:.85}
  .body{padding:40px 40px 32px}
  h1{color:#09090b;font-size:22px;font-weight:700;line-height:1.3;margin-bottom:12px}
  p{color:#52525b;font-size:15px;line-height:1.75;margin-bottom:16px}
  .btn-wrap{text-align:center;margin:28px 0 24px}
  .btn{display:inline-block;background:#6366f1;color:#fff!important;font-size:15px;font-weight:600;padding:14px 36px;border-radius:10px;text-decoration:none}
  .footer{padding:20px 40px 28px;text-align:center;background:#fafafa;border-top:1px solid #f4f4f5}
  .footer p{font-size:12px;color:#a1a1aa;line-height:1.8;margin:0}
</style></head><body>
<div class="shell"><div class="card">
  <div class="header">
    <div class="logo-ring"><span>E</span></div>
    <div class="brand-name">ElevatedPOS</div>
  </div>
  <div class="body">
    <h1>Welcome aboard, ${firstName}! 🎉</h1>
    <p>Your <strong>${businessName}</strong> account has been created. Please verify your email to finish setting up your account.</p>
    <div class="btn-wrap"><a href="${verifyUrl}" class="btn">Verify My Email →</a></div>
    <p style="font-size:13px;color:#a1a1aa">This link expires in 24 hours. Didn't create this account? You can safely ignore this email.</p>
  </div>
  <div class="footer"><p><strong style="color:#71717a">ElevatedPOS</strong> — Questions? <a href="mailto:support@elevatedpos.com.au" style="color:#71717a">support@elevatedpos.com.au</a></p></div>
</div></div></body></html>`;
}
