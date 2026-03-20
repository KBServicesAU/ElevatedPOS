import type { Metadata } from 'next';
import { LoyaltyClient } from './loyalty-client';

export const metadata: Metadata = { title: 'Loyalty' };

export default function LoyaltyPage() {
  return <LoyaltyClient />;
}
