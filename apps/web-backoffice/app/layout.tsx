import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '../providers';

export const metadata: Metadata = {
  title: { default: 'NEXUS', template: '%s | NEXUS' },
  description: 'Unified Commerce & Operations Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
