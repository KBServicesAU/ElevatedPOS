import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { stripeConnectAccounts } from '../db/schema.js';

/**
 * Platform-admin-only integrations routes.
 * All routes here require a valid JWT with type === 'platform'
 * (issued by the auth service for godmode/platform staff logins).
 */
export async function platformIntegrationsRoutes(app: FastifyInstance) {

  // ── GET /integrations/platform/connect-accounts ─────────────────────────────
  // Returns all Stripe Connect account statuses across every org.
  // Used by the godmode Merchants page to show onboarding / payout status.
  app.get('/integrations/platform/connect-accounts', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { type?: string };

    if (user.type !== 'platform') {
      return reply.status(403).send({ error: 'Platform access required' });
    }

    const accounts = await db
      .select({
        orgId: stripeConnectAccounts.orgId,
        stripeAccountId: stripeConnectAccounts.stripeAccountId,
        status: stripeConnectAccounts.status,
        chargesEnabled: stripeConnectAccounts.chargesEnabled,
        payoutsEnabled: stripeConnectAccounts.payoutsEnabled,
        detailsSubmitted: stripeConnectAccounts.detailsSubmitted,
        businessName: stripeConnectAccounts.businessName,
        createdAt: stripeConnectAccounts.createdAt,
      })
      .from(stripeConnectAccounts);

    return reply.send({ data: accounts });
  });
}
