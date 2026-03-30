import type { Metadata } from 'next';
import { FranchiseClient } from './franchise-client';

export const metadata: Metadata = { title: 'Franchise' };

export default function FranchisePage() {
  return <FranchiseClient />;
}
