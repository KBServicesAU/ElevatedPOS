import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Interactive Demo — ElevatedPOS',
  description:
    'Try the ElevatedPOS point-of-sale system right in your browser. Browse products, build orders, and process payments — no sign-up required.',
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
