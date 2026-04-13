import { Suspense } from 'react';
import InvoicesClient from './invoices-client';

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />}>
      <InvoicesClient />
    </Suspense>
  );
}
