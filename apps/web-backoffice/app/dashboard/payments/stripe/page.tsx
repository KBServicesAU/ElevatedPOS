'use client';

/**
 * Stripe Terminal settings have moved to /dashboard/payments (Terminals tab).
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function StripeTerminalRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/payments');
  }, [router]);
  return null;
}
