import type { Metadata } from 'next';
import { LocationsClient } from './locations-client';

export const metadata: Metadata = { title: 'Locations' };

export default function LocationsPage() {
  return <LocationsClient />;
}
