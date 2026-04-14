import { redirect } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect';
import { cookies } from 'next/headers';
import { DashboardShell } from '@/components/dashboard-shell';
import { getSessionUser } from '@/lib/session';

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:4001';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const firstName = user?.firstName ?? 'User';
  const lastName = user?.lastName ?? '';
  const role = user?.role ?? null;

  // Fetch onboarding status + feature flags in one call
  let featureFlags: Record<string, boolean> | null = null;
  const token = cookies().get('elevatedpos_token')?.value;

  if (token) {
    try {
      const res = await fetch(`${AUTH_API_URL}/api/v1/organisations/onboarding`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();

        // Redirect incomplete orgs to the right setup flow
        if (data.step && data.step !== 'completed') {
          // Per-device (new) users go back to /signup; legacy users go to /setup
          redirect(data.billingModel === 'per_device' ? '/signup' : '/setup');
        }

        featureFlags = data.featureFlags ?? null;
      }
    } catch (err: unknown) {
      // Re-throw Next.js redirect errors (redirect() throws internally)
      if (isRedirectError(err)) throw err;
      // Onboarding endpoint unavailable — allow dashboard access
    }
  }

  return (
    <DashboardShell
      firstName={firstName}
      lastName={lastName}
      role={role}
      featureFlags={featureFlags}
    >
      {children}
    </DashboardShell>
  );
}
