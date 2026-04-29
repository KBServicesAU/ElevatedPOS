/**
 * Public service-booking submission endpoint.
 *
 * Wired up by the services storefront template's booking form
 * (apps/storefront/app/[slug]/_templates/services.tsx). The form posts
 * `application/x-www-form-urlencoded` with service / date / time / name /
 * phone / email / notes. We resolve the picked service against the org's
 * configured `bookingServices` to attach a duration, then forward to the
 * integrations service's existing public endpoint at
 * /api/v1/reservations/public/:slug as a `bookingType: 'service'`
 * record. That endpoint handles deposit calculation + Stripe PaymentIntent
 * automatically when the merchant has it configured.
 *
 * v2.7.86
 */

import { NextRequest, NextResponse } from 'next/server';

const INTEGRATIONS_API_URL =
  process.env.INTEGRATIONS_API_URL ?? 'http://localhost:4010';
const AUTH_API_URL =
  process.env.AUTH_API_URL ?? process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001';

interface BookingService {
  name: string;
  durationMinutes: number;
  priceCents: number;
}

async function lookupService(
  slug: string,
  serviceName: string,
): Promise<BookingService | null> {
  try {
    const res = await fetch(
      `${AUTH_API_URL}/api/v1/organisations/by-slug/${encodeURIComponent(slug)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      webStore?: { bookingServices?: BookingService[] };
    };
    const services = data.webStore?.bookingServices ?? [];
    return services.find((s) => s.name === serviceName) ?? null;
  } catch {
    return null;
  }
}

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

  const service = body['service'];
  const date = body['date'];
  const time = body['time'];
  const name = body['name'];
  const phone = body['phone'];
  const email = body['email'];

  if (!service || !date || !time || !name || !phone) {
    return NextResponse.redirect(
      new URL(`/${slug}?booking=missing-fields`, request.url),
      303,
    );
  }

  const matched = await lookupService(slug, service);
  const scheduledAt = `${date}T${time}:00`;

  const payload = {
    bookingType: 'service' as const,
    customerName: name,
    customerPhone: phone,
    customerEmail: email && email.trim() ? email.trim() : `${phone}@noemail.local`,
    scheduledAt,
    durationMinutes: matched?.durationMinutes ?? 30,
    notes: body['notes'] ?? `Service: ${service}`,
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
        new URL(`/${slug}?booking=failed`, request.url),
        303,
      );
    }
    const data = (await res.json()) as { depositRequired?: boolean; reservationId?: string };
    if (data.depositRequired) {
      return NextResponse.redirect(
        new URL(
          `/${slug}?booking=pending-deposit&id=${data.reservationId ?? ''}`,
          request.url,
        ),
        303,
      );
    }
    return NextResponse.redirect(
      new URL(`/${slug}?booking=confirmed&id=${data.reservationId ?? ''}`, request.url),
      303,
    );
  } catch {
    return NextResponse.redirect(
      new URL(`/${slug}?booking=failed`, request.url),
      303,
    );
  }
}
