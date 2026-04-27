'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';

const stripePromise: Promise<Stripe | null> | null = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

interface SetupResponse {
  data?: {
    stripeCustomerId?: string;
    subscriptionId?: string | null;
    status?: string;
    clientSecret?: string | null;
  };
  error?: string;
}

interface BillingSummary {
  pos: number; kds: number; kiosk: number; display: number;
  monthlyTotalCents: number;
}

// v2.7.51 — replaces the "click Continue and skip payment" pseudo-step with
// a real Stripe Payment Element. Payment happens BEFORE step 5 (launch).
function PaymentForm({ orgId, token, onSuccess }: { orgId: string; token: string; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError('');
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/onboard/complete?orgId=${orgId}${token ? `&token=${token}` : ''}`,
      },
      redirect: 'if_required',
    });
    if (result.error) {
      setError(result.error.message ?? 'Payment failed.');
      setSubmitting(false);
      return;
    }
    if (result.paymentIntent?.status === 'succeeded' || result.paymentIntent?.status === 'processing') {
      onSuccess();
    } else {
      setError('Payment was not completed. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] disabled:bg-[#7c3aed]/40 text-white font-semibold py-3 rounded-xl transition-colors"
      >
        {submitting ? 'Processing payment…' : 'Pay & start subscription'}
      </button>
    </form>
  );
}

function SubscriptionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgId = searchParams?.get('orgId') || '';
  const token = searchParams?.get('token') || '';
  const connected = searchParams?.get('connected') === 'true';

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!token) {
        setError('Missing onboarding token. Please restart signup.');
        setLoading(false);
        return;
      }
      try {
        // 1. Read the persisted device summary so we can show the user
        // exactly what they're paying for before they enter card details.
        const statusRes = await fetch('/api/onboard/billing-summary', {
          headers: { 'x-onboarding-token': token },
        });
        const statusJson = await statusRes.json() as { data?: BillingSummary; error?: string };
        if (cancelled) return;
        if (statusRes.ok && statusJson.data) {
          setSummary(statusJson.data);
        }

        // 2. Create the Stripe subscription (in `incomplete` state) and get
        // a PaymentIntent client_secret for the first month's charge.
        const setupRes = await fetch('/api/onboard/billing-setup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-onboarding-token': token,
          },
          body: JSON.stringify({}),
        });
        const setupJson = await setupRes.json() as SetupResponse;
        if (cancelled) return;
        if (!setupRes.ok) {
          setError(setupJson.error ?? 'Could not initialise subscription.');
          setLoading(false);
          return;
        }
        if (setupJson.data?.clientSecret) {
          setClientSecret(setupJson.data.clientSecret);
        } else if (setupJson.data?.subscriptionId === null) {
          // Dashboard-only — no charge needed, advance to complete
          router.push(`/onboard/complete?orgId=${orgId}${token ? `&token=${token}` : ''}`);
          return;
        } else {
          setError('Subscription was not configured correctly.');
        }
      } catch {
        if (!cancelled) setError('Network error. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [token, orgId, router]);

  function handleSuccess() {
    router.push(`/onboard/complete?orgId=${orgId}${token ? `&token=${token}` : ''}`);
  }

  return (
    <div className="flex-1 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {connected && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
            <svg className="h-5 w-5 flex-shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-emerald-300">Payment account connected — Stripe Connect linked successfully.</span>
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Activate your subscription</h1>
          <p className="text-neutral-500 text-sm">Enter your card to start your monthly subscription.</p>
        </div>

        {/* Billing summary */}
        {summary && (
          <div className="border border-[#7c3aed]/20 rounded-2xl p-6 bg-[#7c3aed]/[0.03] mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs text-[#7c3aed] font-semibold uppercase tracking-wide">Today&apos;s charge</div>
              <div className="text-2xl font-bold text-white">${(summary.monthlyTotalCents / 100).toFixed(2)}</div>
            </div>
            <ul className="space-y-1.5 text-sm text-neutral-400">
              {summary.pos > 0     && <li>POS × {summary.pos}</li>}
              {summary.kds > 0     && <li>KDS × {summary.kds}</li>}
              {summary.kiosk > 0   && <li>Kiosk × {summary.kiosk}</li>}
              {summary.display > 0 && <li>Signage × {summary.display}</li>}
            </ul>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
            {error}
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-8 text-center text-sm text-neutral-500">
            Preparing payment…
          </div>
        )}

        {!loading && clientSecret && stripePromise && (
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'night' } }}>
            <PaymentForm orgId={orgId} token={token} onSuccess={handleSuccess} />
          </Elements>
        )}

        {!loading && !clientSecret && !stripePromise && !error && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4 text-sm text-amber-300">
            Payment processing is not configured for this environment. Contact support@elevatedpos.com.au.
          </div>
        )}

        <div className="text-center mt-6">
          <Link
            href={`/onboard/payment-account?orgId=${orgId}${token ? `&token=${token}` : ''}`}
            className="text-xs text-neutral-600 hover:text-neutral-400 underline transition-colors"
          >
            ← Back
          </Link>
        </div>

        <p className="text-xs text-neutral-600 text-center mt-4">
          You can change or cancel your subscription any time from your dashboard.
        </p>
      </div>
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-neutral-600">Loading…</div>}>
      <SubscriptionContent />
    </Suspense>
  );
}
