/**
 * v2.7.40 — In-memory alert rules endpoint.
 * The dashboard alerts page (Alex Center) POSTs to
 * `/api/proxy/alerts/rules` to create an alert rule. That path resolves
 * through the catch-all proxy to the notifications service, which has
 * no `/api/v1/alerts/rules` handler — every create 404'd. This route
 * shadows the catch-all and stores rules in a module-level list so the
 * dashboard "Create Alert Rule" flow succeeds without a DB migration.
 * Rules persist for the lifetime of the Node.js process.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { alertRulesStore } from '@/lib/store';

export async function GET() {
  return NextResponse.json({ data: alertRulesStore.all() });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const trigger = typeof body.trigger === 'string' ? body.trigger : '';
  if (!trigger) {
    return NextResponse.json({ error: 'trigger is required' }, { status: 422 });
  }

  const channels = Array.isArray(body.channels) ? body.channels.filter((c): c is string => typeof c === 'string') : [];
  const rule = alertRulesStore.add({
    trigger,
    ...(typeof body.threshold === 'number' ? { threshold: body.threshold } : {}),
    channels,
    ...(typeof body.recipients === 'string' ? { recipients: body.recipients } : {}),
    ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
  });

  return NextResponse.json({ data: rule }, { status: 201 });
}
