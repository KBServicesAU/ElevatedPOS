import type { Metadata } from 'next';
import './globals.css';
import { ElevatedPOSAppBar } from '@/app/components/ElevatedPOSAppBar';

export const metadata: Metadata = {
  title: 'ElevatedPOS Partner Portal',
  description: 'Reseller and partner management for ElevatedPOS',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg', apple: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 min-h-screen antialiased flex flex-col">
        <ElevatedPOSAppBar currentApp="partner" appLabel="Partner Portal" />
        {children}
      </body>
    </html>
  );
}
