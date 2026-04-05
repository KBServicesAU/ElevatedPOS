import type { Metadata } from 'next';
import { RosterClient } from './roster-client';

export const metadata: Metadata = { title: 'Staff Roster | ElevatedPOS' };

export default function RosterPage() {
  return <RosterClient />;
}
