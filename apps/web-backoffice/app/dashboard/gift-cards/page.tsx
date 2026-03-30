import { Suspense } from 'react';
import GiftCardsClient from './gift-cards-client';

export default function GiftCardsPage() {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />}>
      <GiftCardsClient />
    </Suspense>
  );
}
