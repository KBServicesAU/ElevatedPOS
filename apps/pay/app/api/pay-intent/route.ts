import { NextRequest, NextResponse } from 'next/server';

const INTEGRATIONS_URL = process.env.INTEGRATIONS_API_URL ?? 'http://integrations:4010';

export async function POST(request: NextRequest) {
  let invoiceId: string;
  let orgId: string;
  try {
    const body = await request.json() as { invoiceId: string; orgId: string };
    invoiceId = body.invoiceId;
    orgId = body.orgId;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!invoiceId || !orgId) {
    return NextResponse.json({ error: 'invoiceId and orgId are required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${INTEGRATIONS_URL}/api/v1/connect/invoices/${invoiceId}/pay-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch (err) {
    console.error('[pay-intent] error:', err);
    return NextResponse.json({ error: 'Payment service unavailable. Please try again.' }, { status: 503 });
  }
}
