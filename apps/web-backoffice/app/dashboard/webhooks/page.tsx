import type { Metadata } from 'next';
import { WebhooksClient } from './webhooks-client';

export const metadata: Metadata = { title: 'Webhooks' };

export default function WebhooksPage() {
  return <WebhooksClient />;
}
