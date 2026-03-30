import type { Metadata } from 'next';
import { AlertsClient } from './alerts-client';

export const metadata: Metadata = { title: 'Alerts | NEXUS' };

export default function AlertsPage() {
  return <AlertsClient />;
}
