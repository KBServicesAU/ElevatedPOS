import type { Metadata } from 'next';
import { TimesheetsClient } from './timesheets-client';

export const metadata: Metadata = { title: 'Timesheets' };

export default function TimesheetsPage() {
  return <TimesheetsClient />;
}
