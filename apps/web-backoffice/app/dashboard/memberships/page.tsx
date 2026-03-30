import { Suspense } from 'react';
import MembershipsClient from './memberships-client';

export default function MembershipsPage() {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />}>
      <MembershipsClient />
    </Suspense>
  );
}
