'use client';

import { useEffect } from 'react';

export default function KDSError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[KDS] Error:', error);
  }, [error]);

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[#0f0f0f] text-center">
      <div className="text-5xl mb-4">🔴</div>
      <h1 className="text-2xl font-bold text-white mb-2">Display Error</h1>
      <p className="text-gray-500 mb-6 max-w-sm">{error.message || 'The KDS encountered an error. Refreshing…'}</p>
      <button
        onClick={reset}
        className="rounded-lg bg-yellow-500 px-6 py-2.5 text-sm font-bold text-black hover:bg-yellow-400"
      >
        Reconnect
      </button>
    </div>
  );
}
