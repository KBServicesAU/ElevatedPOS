import type { Metadata } from 'next';
import { AutomationsClient } from './automations-client';

export const metadata: Metadata = { title: 'Automations' };

export default function AutomationsPage() {
  return <AutomationsClient />;
}
