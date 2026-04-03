import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ElevatedPOS Pay',
  description: 'Secure payment portal powered by ElevatedPOS',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-50 min-h-screen">{children}</body>
    </html>
  );
}
