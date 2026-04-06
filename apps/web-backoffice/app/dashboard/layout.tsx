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

  // Lightweight onboarding guard — redirect to /setup if onboarding is incomplete
  const token = cookies().get('elevatedpos_token')?.value;
  if (token) {
    try {
      const res = await fetch(`${AUTH_API_URL}/api/v1/organisations/onboarding`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.step && data.step !== 'completed') {
          redirect('/setup');
        }
      }
    } catch (err: unknown) {
      // Re-throw Next.js redirect errors (redirect() throws internally)
      if (isRedirectError(err)) throw err;
      // Onboarding endpoint unavailable — allow dashboard access
    }
  }

  return (
    <DashboardShell firstName={firstName} lastName={lastName} role={role}>
      {children}
    </DashboardShell>
  );
}
