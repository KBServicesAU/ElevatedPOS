'use client';

import { useEffect, useState } from 'react';
import { X, Package, ShoppingCart, Loader2 } from 'lucide-react';
import { fetchWithDeviceAuth } from '@/lib/device-auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  emoji: string;
  description?: string;
}

type SohState =
  | { status: 'loading' }
  | { status: 'loaded'; quantity: number }
  | { status: 'error' };

// ─── Component ────────────────────────────────────────────────────────────────

export function ProductDetailSheet({
  product,
  onAddToCart,
  onClose,
}: {
  product: Product;
  onAddToCart: () => void;
  onClose: () => void;
}) {
  const [soh, setSoh] = useState<SohState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function fetchSoh() {
      setSoh({ status: 'loading' });
      try {
        const res = await fetchWithDeviceAuth(
          `/api/proxy/stock?productId=${product.id}`,
        );
        if (!res.ok) {
          if (!cancelled) setSoh({ status: 'error' });
          return;
        }
        const json = (await res.json()) as
          | { data?: { quantity?: number; onHand?: number } }
          | { quantity?: number; onHand?: number };

        const inner = 'data' in json && json.data != null ? json.data : json as { quantity?: number; onHand?: number };
        const qty = inner.quantity ?? inner.onHand ?? null;

        if (!cancelled) {
          if (qty === null) {
            setSoh({ status: 'error' });
          } else {
            setSoh({ status: 'loaded', quantity: qty });
          }
        }
      } catch {
        if (!cancelled) setSoh({ status: 'error' });
      }
    }

    fetchSoh();
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  const sohLabel = (() => {
    if (soh.status === 'loading') return null;
    if (soh.status === 'error') return { text: '—', color: 'text-gray-500' };
    if (soh.quantity === 0) return { text: 'Out of stock', color: 'text-red-400' };
    return { text: `${soh.quantity}`, color: 'text-green-400' };
  })();

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      {/* Panel — stop propagation so clicks inside don't close */}
      <div
        className="w-full max-w-md mx-auto rounded-t-2xl bg-[#1a1a2e] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-[#2a2a3a] text-gray-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex flex-col items-center gap-2 pb-4">
          <span className="text-5xl">{product.emoji}</span>
          <h2 className="text-xl font-bold text-white text-center">{product.name}</h2>
          <span className="rounded-full bg-[#2a2a3a] px-3 py-0.5 text-xs font-medium text-indigo-300">
            {product.category}
          </span>
        </div>

        {/* Price */}
        <div className="mb-4 flex flex-col items-center">
          <span className="text-3xl font-extrabold text-indigo-400">
            ${product.price.toFixed(2)}
          </span>
          <span className="text-xs text-gray-500 mt-0.5">Inc. GST</span>
        </div>

        {/* Description */}
        {product.description && (
          <p className="mb-4 text-center text-sm text-gray-400 leading-relaxed">
            {product.description}
          </p>
        )}

        {/* SOH row */}
        <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-[#2a2a3a] px-4 py-3">
          <Package className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-400">Stock on hand:</span>
          {soh.status === 'loading' ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
          ) : (
            <span className={`text-sm font-semibold ${sohLabel!.color}`}>
              {sohLabel!.text}
            </span>
          )}
        </div>

        {/* Separator */}
        <div className="mb-4 border-t border-[#2a2a3a]" />

        {/* Add to Order button */}
        <button
          onClick={() => {
            onAddToCart();
            onClose();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3.5 text-base font-bold text-white transition-colors hover:bg-indigo-400"
        >
          <ShoppingCart className="h-5 w-5" />
          Add to Order
        </button>
      </div>
    </div>
  );
}
