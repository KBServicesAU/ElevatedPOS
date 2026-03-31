import { Suspense } from 'react';
import { PriceListsClient } from './price-lists-client';
import PriceListsLoading from './loading';

export const metadata = {
  title: 'Price Lists — ElevatedPOS',
};

export default function PriceListsPage() {
  return (
    <Suspense fallback={<PriceListsLoading />}>
      <PriceListsClient />
    </Suspense>
  );
}
