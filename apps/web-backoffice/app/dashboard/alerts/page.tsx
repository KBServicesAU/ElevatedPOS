import type { Metadata } from 'next';
import { AlertsClient } from './alerts-client';

export const metadata: Metadata = { title: 'Alerts | ElevatedPOS' };

export default function AlertsPage() {
  return <AlertsClient />;
}
