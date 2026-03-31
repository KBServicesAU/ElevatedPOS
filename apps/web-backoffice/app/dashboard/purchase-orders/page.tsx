import { Suspense } from 'react';
import { PurchaseOrdersClient } from './purchase-orders-client';
import Loading from './loading';

export const metadata = { title: 'Purchase Orders | ElevatedPOS' };

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <PurchaseOrdersClient />
    </Suspense>
  );
}
