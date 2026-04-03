import { NextRequest, NextResponse } from 'next/server';

const INTEGRATIONS_URL = process.env.INTEGRATIONS_API_URL ?? 'http://integrations:4010';

export async function POST(request: NextRequest) {
  const { invoiceId, orgId } = await request.json() as { invoiceId: string; orgId: string };

  const res = await fetch(`${INTEGRATIONS_URL}/api/v1/connect/invoices/${invoiceId}/pay-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgId }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 200 : res.status });
}
