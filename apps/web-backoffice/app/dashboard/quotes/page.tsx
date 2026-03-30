import { Suspense } from 'react';
import QuotesClient from './quotes-client';

export default function QuotesPage() {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />}>
      <QuotesClient />
    </Suspense>
  );
}
