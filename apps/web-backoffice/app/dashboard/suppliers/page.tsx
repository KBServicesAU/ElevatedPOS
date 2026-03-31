import { Suspense } from 'react';
import { SuppliersClient } from './suppliers-client';
import Loading from './loading';

export const metadata = { title: 'Suppliers | ElevatedPOS' };

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <SuppliersClient />
    </Suspense>
  );
}
