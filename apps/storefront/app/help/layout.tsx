import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help Centre — ElevatedPOS',
  description:
    'Find answers to common questions about ElevatedPOS. Browse our FAQ covering getting started, payments, hardware, and account management.',
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
