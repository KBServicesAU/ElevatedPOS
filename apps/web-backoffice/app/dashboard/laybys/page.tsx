import { Suspense } from 'react';
import LaybysClient from './laybys-client';

export default function LaybysPage() {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />}>
      <LaybysClient />
    </Suspense>
  );
}
