import type { Metadata } from 'next';
import './globals.css';
import { NexusAppBar } from '@/components/nexus-app-bar';

export const metadata: Metadata = {
  title: 'NEXUS Developer Platform',
  description: 'Build integrations that operators love',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 min-h-screen font-sans antialiased flex flex-col">
        <NexusAppBar currentApp="developer" appLabel="Developer Portal" />
        {children}
      </body>
    </html>
  );
}
