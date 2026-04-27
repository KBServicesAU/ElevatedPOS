import type { Metadata } from 'next';
import { AuditLogsClient } from './audit-logs-client';

export const metadata: Metadata = { title: 'Audit Logs' };

export default function AuditLogsPage() {
  return <AuditLogsClient />;
}
