import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact — ElevatedPOS',
  description:
    'Get in touch with the ElevatedPOS team. Reach us for sales enquiries, support, partnerships, or general questions.',
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
