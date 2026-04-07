import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Careers — ElevatedPOS',
  description:
    'Join the team reimagining hospitality tech. Remote-first roles across engineering, design, and customer success.',
};

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
