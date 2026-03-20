import type { Metadata } from 'next';
import { CampaignsClient } from './campaigns-client';

export const metadata: Metadata = { title: 'Campaigns' };

export default function CampaignsPage() {
  return <CampaignsClient />;
}
