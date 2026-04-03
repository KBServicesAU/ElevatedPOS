import { NextRequest, NextResponse } from 'next/server';

const INTEGRATIONS_URL = process.env.INTEGRATIONS_API_URL ?? 'http://integrations:4010';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('orgId');
  const email = searchParams.get('email');

  if (!orgId || !email) {
    return NextResponse.json({ error: 'orgId and email are required' }, { status: 400 });
  }

  // Find the connected account for this org
  const accountRes = await fetch(`${INTEGRATIONS_URL}/api/v1/connect/account/${orgId}`);
  if (!accountRes.ok) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

  const account = await accountRes.json() as { stripeAccountId: string };

  // Find customer by email in Stripe — call integrations service
  const lookupRes = await fetch(
    `${INTEGRATIONS_URL}/api/v1/connect/customer-lookup?stripeAccountId=${account.stripeAccountId}&email=${encodeURIComponent(email)}`
  );

  if (!lookupRes.ok) return NextResponse.json({ error: 'No account found for this email address.' }, { status: 404 });

  const { stripeCustomerId } = await lookupRes.json() as { stripeCustomerId: string };

  // Fetch subscriptions and invoices
  const dataRes = await fetch(
    `${INTEGRATIONS_URL}/api/v1/connect/subscriptions/customer/${stripeCustomerId}?orgId=${orgId}`
  );

  if (!dataRes.ok) return NextResponse.json({ error: 'Could not load subscription data.' }, { status: 500 });

  const data = await dataRes.json();
  return NextResponse.json({ ...data, stripeCustomerId });
}
