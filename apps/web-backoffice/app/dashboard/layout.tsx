import { DashboardShell } from '@/components/dashboard-shell';
import { getSessionUser } from '@/lib/session';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const firstName = user?.firstName ?? 'User';
  const lastName = user?.lastName ?? '';
  const role = user?.role ?? null;

  return (
    <DashboardShell firstName={firstName} lastName={lastName} role={role}>
      {children}
    </DashboardShell>
  );
}
