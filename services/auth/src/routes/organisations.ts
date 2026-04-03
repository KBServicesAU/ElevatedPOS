import { type FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { hashPassword } from '../lib/tokens.js';

const NOTIFICATIONS_API_URL = process.env['NOTIFICATIONS_API_URL'] ?? 'http://localhost:4009';
const INTEGRATIONS_API_URL = process.env['INTEGRATIONS_API_URL'] ?? 'http://localhost:4010';
const APP_URL = process.env['APP_URL'] ?? 'https://app.elevatedpos.com.au';

export async function organisationRoutes(app: FastifyInstance) {
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
        },
      },
    },
  }, async (request, reply) => {
    const { businessName, email, password, firstName, lastName, abn, plan = 'starter' } = request.body as {
      businessName: string; email: string; password: string;
      firstName: string; lastName: string; phone?: string; abn?: string; plan?: string;
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
          onboardingStep: 'account_created',
        }).returning();

        const [employee] = await tx.insert(schema.employees).values({
          orgId: org!.id,
          email,
          passwordHash,
          firstName,
          lastName,
          isActive: true,
        }).returning();

        return { org: org!, employee: employee! };
      });

      // Fire-and-forget: send welcome email via notifications service
      // We sign a short-lived internal token so the notifications service accepts the call
      const internalToken = app.jwt.sign(
        { sub: result.employee.id, orgId: result.org.id, role: 'system' },
        { expiresIn: '5m' },
      );

      fetch(`${NOTIFICATIONS_API_URL}/api/v1/notifications/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalToken}` },
        body: JSON.stringify({
          to: result.employee.email,
          subject: `Welcome to ElevatedPOS, ${firstName}!`,
          template: 'custom',
          data: {
            body: `
              <h2>Welcome to ElevatedPOS, ${firstName}!</h2>
              <p>Your account for <strong>${businessName}</strong> has been created successfully.</p>
              <p><strong>Plan:</strong> ${result.org.plan}</p>
              <p>You can now log in and start setting up your store:</p>
              <p><a href="${APP_URL}/login" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Log in to ElevatedPOS</a></p>
              <p>If you have any questions, reply to this email or contact our support team.</p>
              <p>— The ElevatedPOS Team</p>
            `,
          },
          orgId: result.org.id,
        }),
      }).catch((err: unknown) => {
        console.error('[organisations/register] failed to send welcome email', err instanceof Error ? err.message : String(err));
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
}
