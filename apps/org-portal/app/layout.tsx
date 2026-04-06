import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from './theme-provider';

export const metadata: Metadata = {
  title: { default: 'ElevatedPOS Support Portal', template: '%s | Support Portal' },
  description: 'ElevatedPOS Organisation Support Portal',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg', apple: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-white dark:bg-gray-950 font-sans antialiased transition-colors">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
