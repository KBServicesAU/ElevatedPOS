import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog — ElevatedPOS',
  description:
    'Ideas, updates, and guides on running a better venue. Thoughts from the ElevatedPOS team.',
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
