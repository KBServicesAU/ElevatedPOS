'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const infoCards = [
  {
    icon: (
      <svg className="w-5 h-5 text-[#7c3aed]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Fast payouts',
    description: 'Funds deposited within 2 business days',
  },
  {
    icon: (
      <svg className="w-5 h-5 text-[#7c3aed]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
    title: 'All major cards accepted',
    description: 'Accept Visa, Mastercard, and Amex',
  },
  {
    icon: (
      <svg className="w-5 h-5 text-[#7c3aed]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    title: 'Australian accounts only',
    description: 'For Australian registered businesses',
  },
];

function PaymentAccountContent() {
  const searchParams = useSearchParams();
  const orgId = searchParams?.get('orgId') || '';
  const plan = searchParams?.get('plan') || 'starter';
  const token = searchParams?.get('token') || '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const skipHref = `/onboard/subscription?orgId=${orgId}&plan=${plan}${token ? `&token=${token}` : ''}`;

  async function handleConnect() {
    setError('');
    setLoading(true);
    try {
      const returnUrl = encodeURIComponent(
        `${window.location.origin}/onboard/subscription?orgId=${orgId}&plan=${plan}&connected=true`,
      );
      const refreshUrl = encodeURIComponent(
        `${window.location.origin}/onboard/payment-account?orgId=${orgId}&plan=${plan}&refresh=true`,
      );
      const res = await fetch('/api/onboard/connect-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          returnUrl: decodeURIComponent(returnUrl),
          refreshUrl: decodeURIComponent(refreshUrl),
        }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Failed to start payment setup. Please try again.');
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Set up your payment processing account</h1>
          <p className="text-neutral-500 text-sm leading-relaxed">
            Accept card payments from customers. Your funds are deposited directly to your Australian bank account.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 mb-8">
          {infoCards.map((card) => (
            <div key={card.title} className="flex items-start gap-4 p-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
              <div className="w-10 h-10 rounded-lg bg-[#7c3aed]/10 flex items-center justify-center flex-shrink-0">
                {card.icon}
              </div>
              <div>
                <div className="text-sm font-semibold text-white">{card.title}</div>
                <div className="text-sm text-neutral-500 mt-0.5">{card.description}</div>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleConnect}
            disabled={loading}
            className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] disabled:bg-[#7c3aed]/50 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Connecting…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Connect payment account
              </>
            )}
          </button>

          <div className="text-center">
            <Link
              href={skipHref}
              className="text-sm text-neutral-600 hover:text-neutral-400 underline transition-colors"
            >
              Skip for now
            </Link>
          </div>
        </div>

        <p className="text-xs text-neutral-600 text-center mt-6">
          Payment processing is powered by Stripe. Your financial data is encrypted and secure.
        </p>
      </div>
    </div>
  );
}

export default function PaymentAccountPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-neutral-600">Loading…</div>}>
      <PaymentAccountContent />
    </Suspense>
  );
}
