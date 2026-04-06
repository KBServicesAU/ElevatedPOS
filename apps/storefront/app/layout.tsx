import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ElevatedPOS Store',
  description: 'Shop online',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg', apple: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100 antialiased">{children}</body>
    </html>
  );
}
