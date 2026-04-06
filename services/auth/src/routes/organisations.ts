import { type FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { hashPassword } from '../lib/tokens.js';

const industryValues = ['cafe', 'restaurant', 'bar', 'retail', 'fashion', 'grocery', 'salon', 'gym', 'services', 'other'] as const;
const onboardingSteps = ['industry_selected', 'location_setup', 'products_added', 'completed'] as const;

const NOTIFICATIONS_API_URL = process.env['NOTIFICATIONS_API_URL'] ?? 'http://localhost:4009';
const INTEGRATIONS_API_URL = process.env['INTEGRATIONS_API_URL'] ?? 'http://localhost:4010';
const APP_URL = process.env['APP_URL'] ?? 'https://app.elevatedpos.com.au';

export async function organisationRoutes(app: FastifyInstance) {
  // GET /organisations/by-slug/:slug — public, no auth required
  app.get('/by-slug/:slug', { config: { skipAuth: true } }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const org = await db.query.organisations.findFirst({
      where: eq(schema.organisations.slug, slug),
    });
    if (!org) return reply.status(404).send({ error: 'Organisation not found' });
    return reply.send({ id: org.id, name: org.name, slug: org.slug });
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
    const { businessName, email, password, firstName, lastName, abn, plan = 'starter', industry } = request.body as {
      businessName: string; email: string; password: string;
      firstName: string; lastName: string; phone?: string; abn?: string; plan?: string;
      industry?: string;
    };

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
          plan,
          maxLocations: limits.maxLocations,
          maxDevices: limits.maxDevices,
          abn: abn ?? null,
          billingEmail: email,
          industry: industry ?? null,
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

      fetch(`${NOTIFICATIONS_API_URL}/api/v1/notifications/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalToken}` },
        body: JSON.stringify({
          to: result.employee.email,
          subject: `Verify your email — welcome to ElevatedPOS, ${firstName}!`,
          htmlBody: verificationHtml,
          orgId: result.org.id,
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

      return reply.status(201).send({
        orgId: result.org.id,
        employeeId: result.employee.id,
        email: result.employee.email,
        businessName: result.org.name,
        plan: result.org.plan,
        onboardingStep: result.org.onboardingStep,
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
    });
  });

  // PATCH /api/v1/organisations/onboarding — advance onboarding step
  app.patch('/onboarding', { onRequest: [app.authenticate] }, async (request, reply) => {
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
  });
}
