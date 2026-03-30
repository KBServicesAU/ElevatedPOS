'use client';

/**
 * Minimal toast hook built on top of @radix-ui/react-toast.
 * Usage:
 *   const { toast } = useToast();
 *   toast({ title: 'Saved!', variant: 'success' });
 */

import { useCallback } from 'react';

export type ToastVariant = 'default' | 'success' | 'destructive';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Duration in ms. Defaults to 4000. */
  duration?: number;
}

// Global dispatch — set by the ToastRegion component mounted in providers.tsx
let _dispatch: ((opts: ToastOptions) => void) | null = null;

export function _registerToastDispatch(fn: (opts: ToastOptions) => void) {
  _dispatch = fn;
}

export function useToast() {
  const toast = useCallback((opts: ToastOptions) => {
    if (_dispatch) {
      _dispatch(opts);
    } else {
      // Fallback during SSR or before provider mounts
      console.warn('[useToast] toast called before provider mounted:', opts.title);
    }
  }, []);

  return { toast };
}
