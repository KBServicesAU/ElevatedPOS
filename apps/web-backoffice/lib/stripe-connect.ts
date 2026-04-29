import { type NextRequest } from 'next/server';

/**
 * v2.7.78 — Resolve the requesting org's Stripe Connect account for
 * direct-charge payment flows.
 *
 * The web-backoffice's Stripe routes (qr-checkout, qr-status, capture,
 * payment-intent) all need to charge ON the merchant's connected
 * account, not the platform's account. Otherwise:
 *   • Funds land in the platform's Stripe balance instead of the
 *     merchant's — they don't see the payment in their Stripe
 *     dashboard, payouts have to be settled by hand, the platform
 *     becomes responsible for chargebacks.
 *   • Apple Pay / Google Pay / PayTo etc. are driven by the
 *     *connected account's* Stripe Dashboard payment-method settings,
 *     not the platform's. Direct charges let the merchant control
 *     which methods appear at checkout from their own Stripe console.
 *
 * This helper hits the integrations service's
 * /api/v1/connect/account-status with the inbound auth header and
 * returns the resolved account, or null if the merchant hasn't
 * completed Connect onboarding yet.
 */
export interface ResolvedConnectAccount {
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  /** Basis points — 100 = 1%. */
  platformFeePercent: number;
  /** Per-org opt-in for the customer-screen QR Pay flow (added v2.7.78). */
  qrPayEnabled: boolean;
}

const INTEGRATIONS_API_URL = process.env['INTEGRATIONS_API_URL'] ?? 'http://localhost:4010';

export async function resolveConnectAccount(
  req: NextRequest,
): Promise<ResolvedConnectAccount | null> {
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization');
  // The /qr-checkout call comes from POS or kiosk with a Bearer token
  // (employee or device JWT). For the web-cookie auth used by the
  // dashboard, the proxy layer also forwards the cookie via the
  // Bearer header before the call lands here.
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (auth) headers.Authorization = auth;

  try {
    const res = await fetch(`${INTEGRATIONS_API_URL}/api/v1/connect/account-status`, {
      headers,
      // Cache a couple of seconds — repeated charges hit this in
      // quick succession and the row barely changes.
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.warn('[stripe-connect] account-status fetch failed', res.status);
      return null;
    }
    const json = (await res.json()) as Partial<ResolvedConnectAccount> | null;
    if (!json || !json.stripeAccountId) return null;
    return {
      stripeAccountId: json.stripeAccountId,
      chargesEnabled: !!json.chargesEnabled,
      payoutsEnabled: !!json.payoutsEnabled,
      platformFeePercent: typeof json.platformFeePercent === 'number' ? json.platformFeePercent : 0,
      qrPayEnabled: !!json.qrPayEnabled,
    };
  } catch (err) {
    console.warn('[stripe-connect] account-status fetch threw', err);
    return null;
  }
}

/**
 * Compute the platform fee for a given charge amount. `platformFeePercent`
 * is in basis points (100 = 1%); the result is in cents and floored
 * to a whole cent (Stripe rejects fractional cents).
 *
 * Caller decides whether to apply the fee — this is just the math.
 * Tip amounts are typically excluded so the merchant keeps the full tip.
 */
export function calcPlatformFeeCents(
  chargeAmountCents: number,
  platformFeePercent: number,
): number {
  const bps = Math.max(0, Math.min(10_000, platformFeePercent)); // clamp 0..100%
  return Math.floor((chargeAmountCents * bps) / 10_000);
}
