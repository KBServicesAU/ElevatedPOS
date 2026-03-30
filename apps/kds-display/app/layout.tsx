import type { Metadata } from 'next';
import './globals.css';
import { NexusAppBar } from '@/components/nexus-app-bar';

export const metadata: Metadata = { title: 'NEXUS KDS' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex flex-col min-h-screen">
        <NexusAppBar currentApp="kds" appLabel="KDS Display" />
        {children}
      </body>
    </html>
  );
}
