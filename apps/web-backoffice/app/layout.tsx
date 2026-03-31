import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '../providers';
import { CommandPalette } from '../components/CommandPalette';

export const metadata: Metadata = {
  title: { default: 'ElevatedPOS', template: '%s | ElevatedPOS' },
  description: 'Unified Commerce & Operations Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Inline script runs before React — prevents flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('elevatedpos-theme');if(t==='dark'||(t===null&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>
          <CommandPalette />
          {children}
        </Providers>
      </body>
    </html>
  );
}
