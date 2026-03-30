import { Suspense } from 'react';
import MarkdownsClient from './markdowns-client';

export default function MarkdownsPage() {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />}>
      <MarkdownsClient />
    </Suspense>
  );
}
