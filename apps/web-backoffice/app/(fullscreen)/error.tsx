'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary for fullscreen apps (POS, KDS, Kiosk).
 * Displayed when an unhandled error occurs in any of those routes.
 */
export default function FullscreenError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to console for debugging; swap for a real logger in production
    console.error('[Fullscreen Error]', error);
  }, [error]);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-6 bg-gray-950 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/20">
        <AlertTriangle className="h-8 w-8 text-red-400" />
      </div>

      <div className="max-w-sm">
        <h1 className="mb-2 text-xl font-bold text-white">Something went wrong</h1>
        <p className="text-sm text-gray-400">
          An unexpected error occurred. Please try reloading or contact support if the problem
          persists.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-gray-600">Error ref: {error.digest}</p>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 active:scale-95"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
        <a
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl border border-gray-700 px-5 py-2.5 text-sm font-semibold text-gray-300 transition hover:bg-gray-800"
        >
          Back to Dashboard
        </a>
      </div>
    </div>
  );
}
