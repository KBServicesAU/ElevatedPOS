import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About — ElevatedPOS',
  description:
    'Built in Australia for Australian hospitality. Meet the team behind ElevatedPOS and learn why we started.',
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
