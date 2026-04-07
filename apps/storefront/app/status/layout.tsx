import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'System Status — ElevatedPOS',
  description:
    'Check the real-time operational status of all ElevatedPOS services including POS Terminal, Kitchen Display, Payment Processing, and more.',
};

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return children;
}
