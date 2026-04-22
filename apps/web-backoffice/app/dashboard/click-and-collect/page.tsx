import { Suspense } from 'react';
import ClickAndCollectClient from './click-and-collect-client';

export default function ClickAndCollectPage() {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />}>
      <ClickAndCollectClient />
    </Suspense>
  );
}
