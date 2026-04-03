import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Godmode — ElevatedPOS',
  description: 'Platform super-admin portal',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg', apple: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0a0f] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
