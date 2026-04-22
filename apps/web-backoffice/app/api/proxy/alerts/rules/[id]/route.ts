/**
 * v2.7.40 — alert rule toggle + delete. Matches the in-memory store
 * defined in @/lib/store. See ../route.ts for context.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { alertRulesStore } from '@/lib/store';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: { enabled?: boolean } = {};
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;

  const updated = alertRulesStore.update(params.id, patch);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ data: updated });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const ok = alertRulesStore.remove(params.id);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
