import type { Metadata } from 'next';
import './globals.css';
import { NexusAppBar } from '@/app/components/NexusAppBar';

export const metadata: Metadata = {
  title: 'NEXUS Partner Portal',
  description: 'Reseller and partner management for NEXUS POS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 min-h-screen antialiased flex flex-col">
        <NexusAppBar currentApp="partner" appLabel="Partner Portal" />
        {children}
      </body>
    </html>
  );
}
