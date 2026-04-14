'use client';

/**
 * Terminal Settings — redirects to the consolidated Payment & Connect page.
 *
 * All EFTPOS configuration (ANZ Worldline, Tyro, Stripe Terminal, crash
 * recovery) has been moved to /dashboard/payments.
 */

import { CreditCard } from 'lucide-react';

export default function TerminalSettingsPage() {
  return (
    <div className="mx-auto max-w-xl p-8 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-900/30">
        <CreditCard className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
      </div>
      <h1 className="mb-3 text-xl font-bold text-gray-900 dark:text-white">Terminal settings have moved</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        All EFTPOS terminal configuration — Tyro, ANZ Worldline, Stripe Terminal, crash recovery,
        and compliance settings — is now in the Payment &amp; Connect hub.
      </p>
      <a
        href="/dashboard/payments"
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
      >
        Go to Payment &amp; Connect →
      </a>
      <p className="mt-4 text-xs text-gray-400">
        Quick links:{' '}
        <a href="/dashboard/payments?tab=terminals" className="underline hover:text-gray-600">Terminals</a>
        {' · '}
        <a href="/dashboard/payments?tab=recovery" className="underline hover:text-gray-600">Crash Recovery</a>
        {' · '}
        <a href="/dashboard/payments?tab=compliance" className="underline hover:text-gray-600">Compliance</a>
      </p>
    </div>
  );
}
