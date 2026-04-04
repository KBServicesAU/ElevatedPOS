import { Suspense } from 'react';
import { StocktakeClient } from './stocktake-client';
import Loading from './loading';
import { getSessionUser } from '@/lib/session';

export const metadata = { title: 'Stocktake | ElevatedPOS' };

export default async function Page() {
  const user = await getSessionUser();
  const currentUserName = user ? `${user.firstName} ${user.lastName}`.trim() : 'Unknown';
  return (
    <Suspense fallback={<Loading />}>
      <StocktakeClient currentUserName={currentUserName} />
    </Suspense>
  );
}
