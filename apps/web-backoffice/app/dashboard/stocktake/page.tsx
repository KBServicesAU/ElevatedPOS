import { Suspense } from 'react';
import { StocktakeClient } from './stocktake-client';
import Loading from './loading';

export const metadata = { title: 'Stocktake | NEXUS' };

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <StocktakeClient />
    </Suspense>
  );
}
