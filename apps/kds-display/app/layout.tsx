import type { Metadata } from 'next';
import './globals.css';
import { ElevatedPOSAppBar } from '@/components/elevatedpos-app-bar';

export const metadata: Metadata = {
  title: 'ElevatedPOS KDS',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg', apple: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex flex-col min-h-screen">
        <ElevatedPOSAppBar currentApp="kds" appLabel="KDS Display" />
        {children}
      </body>
    </html>
  );
}
