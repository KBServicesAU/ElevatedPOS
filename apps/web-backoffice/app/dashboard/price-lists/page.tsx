import { Suspense } from 'react';
import { PriceListsClient } from './price-lists-client';
import PriceListsLoading from './loading';

export const metadata = {
  title: 'Price Lists — NEXUS',
};

export default function PriceListsPage() {
  return (
    <Suspense fallback={<PriceListsLoading />}>
      <PriceListsClient />
    </Suspense>
  );
}
