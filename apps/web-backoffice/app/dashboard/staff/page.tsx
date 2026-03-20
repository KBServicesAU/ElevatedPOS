import type { Metadata } from 'next';
import { StaffClient } from './staff-client';

export const metadata: Metadata = { title: 'Staff' };

export default function StaffPage() {
  return <StaffClient />;
}
