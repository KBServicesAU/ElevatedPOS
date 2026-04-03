'use client';

import { PrinterProvider } from './printer-context';

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <PrinterProvider>{children}</PrinterProvider>;
}
