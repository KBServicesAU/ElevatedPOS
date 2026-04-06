import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ElevatedPOS KDS',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg', apple: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/*
       * KDS is a fullscreen kitchen/status display — no app-switcher bar.
       * The body must NOT have overflow:hidden here (globals.css handles it)
       * and must not constrain height so the child pages can use h-screen freely.
       */}
      <body>{children}</body>
    </html>
  );
}
