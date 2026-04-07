import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Downloads | ElevatedPOS',
  description:
    'Download the latest ElevatedPOS apps for Android POS terminals, kitchen displays, and self-service kiosks.',
};

export default function DownloadsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
