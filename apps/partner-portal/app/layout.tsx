import type { Metadata } from 'next';
import './globals.css';
import { ElevatedPOSAppBar } from '@/app/components/ElevatedPOSAppBar';

export const metadata: Metadata = {
  title: 'ElevatedPOS Partner Portal',
  description: 'Reseller and partner management for ElevatedPOS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 min-h-screen antialiased flex flex-col">
        <ElevatedPOSAppBar currentApp="partner" appLabel="Partner Portal" />
        {children}
      </body>
    </html>
  );
}
