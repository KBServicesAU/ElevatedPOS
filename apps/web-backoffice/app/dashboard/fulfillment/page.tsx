import { Suspense } from 'react';
import FulfillmentClient from './fulfillment-client';

export default function FulfillmentPage() {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />}>
      <FulfillmentClient />
    </Suspense>
  );
}
