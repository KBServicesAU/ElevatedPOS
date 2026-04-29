/**
 * Public reservation submission endpoint.
 *
 * Wired up by the hospitality storefront template's reservation form
 * (apps/storefront/app/[slug]/_templates/hospitality.tsx). The form posts
 * `application/x-www-form-urlencoded` with date / time / name / phone /
 * party-size, and we forward it as JSON to the integrations service's
 * existing public endpoint at /api/v1/reservations/public/:slug, which
 * already handles deposit calculation + Stripe PaymentIntent for orgs
 * with a connected Stripe account.
 *
 * On success we redirect the customer to a simple confirmation route
 * back on the storefront so they don't see raw JSON.
 *
 * v2.7.86
 */

import { NextRequest, NextResponse } from 'next/server';

const INTEGRATIONS_API_URL =
  process.env.INTEGRATIONS_API_URL ?? 'http://localhost:4010';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let body: Record<string, string> = {};
  try {
    const ct = request.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      body = (await request.json()) as Record<string, string>;
    } else {
      const form = await request.formData();
      for (const [k, v] of form.entries()) body[k] = String(v);
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const date = body['date'];
  const time = body['time'];
  const name = body['name'];
  const phone = body['phone'];
  const email = body['email'];
  const partyRaw = body['party'];

  if (!date || !time || !name || !phone) {
    return NextResponse.redirect(
      new URL(`/${slug}?reservation=missing-fields`, request.url),
      303,
    );
  }

  // Build the ISO scheduledAt — date + time in the merchant's local TZ.
  // We don't know the org's TZ at this point in the request, so we send a
  // naive local ISO and let the integrations service interpret it. The
  // current integrations route accepts that and stores the Date as-is.
  const scheduledAt = `${date}T${time}:00`;

  const payload = {
    bookingType: 'restaurant' as const,
    customerName: name,
    customerPhone: phone,
    customerEmail: email && email.trim() ? email.trim() : `${phone}@noemail.local`,
    scheduledAt,
    partySize: partyRaw ? Number(partyRaw) : undefined,
    notes: body['notes'] ?? undefined,
  };

  try {
    const res = await fetch(
      `${INTEGRATIONS_API_URL}/api/v1/reservations/public/${encodeURIComponent(slug)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      },
    );
    if (!res.ok) {
      return NextResponse.redirect(
        new URL(`/${slug}?reservation=failed`, request.url),
        303,
      );
    }
    const data = (await res.json()) as { depositRequired?: boolean; reservationId?: string };
    if (data.depositRequired) {
      // Deposit flow not yet wired through the storefront; the merchant
      // will see the pending row in dashboard/reservations and can take
      // payment manually until the storefront-side Stripe Checkout step
      // is built. For now, treat as confirmed-pending.
      return NextResponse.redirect(
        new URL(`/${slug}?reservation=pending-deposit&id=${data.reservationId ?? ''}`, request.url),
        303,
      );
    }
    return NextResponse.redirect(
      new URL(`/${slug}?reservation=confirmed&id=${data.reservationId ?? ''}`, request.url),
      303,
    );
  } catch {
    return NextResponse.redirect(
      new URL(`/${slug}?reservation=failed`, request.url),
      303,
    );
  }
}
