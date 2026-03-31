'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ElevatedPOS] Dashboard page error:', error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <div className="max-w-md">
        <div className="mb-5 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-900/20">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
        </div>
        <h2 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">
          This page ran into an error
        </h2>
        <p className="mb-1 text-sm text-gray-500">
          {error.message || 'An unexpected error occurred while loading this page.'}
        </p>
        {error.digest && (
          <p className="mb-6 font-mono text-xs text-gray-400">Ref: {error.digest}</p>
        )}
        {!error.digest && <div className="mb-6" />}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="flex items-center gap-2 rounded-lg bg-elevatedpos-600 px-4 py-2 text-sm font-medium text-white hover:bg-elevatedpos-700 active:scale-95 transition-transform"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
          <a
            href="/dashboard"
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <LayoutDashboard className="h-4 w-4" />
            Go to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
