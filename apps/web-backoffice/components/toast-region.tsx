'use client';

/**
 * ToastRegion — mounts the Radix Toast provider + viewport and wires up
 * the global _registerToastDispatch so any component can call useToast().
 */

import { useEffect, useState, useCallback } from 'react';
import * as Toast from '@radix-ui/react-toast';
import { _registerToastDispatch, type ToastOptions } from '@/lib/use-toast';

interface ToastItem extends ToastOptions {
  id: number;
  open: boolean;
}

let _idCounter = 0;

const variantStyles: Record<string, string> = {
  default:
    'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white',
  success:
    'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-900 dark:text-green-100',
  destructive:
    'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-900 dark:text-red-100',
};

export function ToastRegion() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dispatch = useCallback((opts: ToastOptions) => {
    const id = ++_idCounter;
    setToasts((prev) => [...prev, { ...opts, id, open: true }]);
  }, []);

  useEffect(() => {
    _registerToastDispatch(dispatch);
  }, [dispatch]);

  function close(id: number) {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, open: false } : t)));
    // Remove after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }

  return (
    <Toast.Provider swipeDirection="right">
      {toasts.map((t) => (
        <Toast.Root
          key={t.id}
          open={t.open}
          onOpenChange={(open) => !open && close(t.id)}
          duration={t.duration ?? 4000}
          className={`
            flex items-start gap-3 rounded-xl p-4 shadow-lg
            data-[state=open]:animate-in data-[state=closed]:animate-out
            data-[swipe=end]:animate-out data-[state=closed]:fade-out-80
            data-[state=open]:slide-in-from-top-full
            data-[state=closed]:slide-out-to-right-full
            ${variantStyles[t.variant ?? 'default']}
          `}
        >
          {/* Icon */}
          <span className="mt-0.5 shrink-0">
            {t.variant === 'success' && (
              <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
            {t.variant === 'destructive' && (
              <svg className="h-4 w-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {(!t.variant || t.variant === 'default') && (
              <svg className="h-4 w-4 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
              </svg>
            )}
          </span>

          <div className="min-w-0 flex-1">
            <Toast.Title className="text-sm font-semibold leading-snug">{t.title}</Toast.Title>
            {t.description && (
              <Toast.Description className="mt-0.5 text-xs opacity-80">
                {t.description}
              </Toast.Description>
            )}
          </div>

          <Toast.Close
            onClick={() => close(t.id)}
            className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Close"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Toast.Close>
        </Toast.Root>
      ))}

      <Toast.Viewport className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] outline-none" />
    </Toast.Provider>
  );
}
