import type { Metadata } from 'next';
import DevicesClient from './devices-client';

export const metadata: Metadata = { title: 'Devices | ElevatedPOS' };

export default function DevicesPage() {
  return <DevicesClient />;
}
