import { type FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { hashPassword } from '../lib/tokens.js';

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
    const { businessName, email, password, firstName, lastName, phone, abn, plan = 'starter' } = request.body as {
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
          phone: phone ?? null,
          isActive: true,
        }).returning();

        return { org: org!, employee: employee! };
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
