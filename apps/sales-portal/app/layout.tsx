import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ElevatedPOS Sales Portal', template: '%s | Sales Portal' },
  description: 'ElevatedPOS Sales Agent Portal',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg', apple: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
