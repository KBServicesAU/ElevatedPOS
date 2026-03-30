import type { Metadata } from 'next';
import { StampsClient } from './stamps-client';

export const metadata: Metadata = { title: 'Stamp Cards' };

export default function StampsPage() {
  return <StampsClient />;
}
