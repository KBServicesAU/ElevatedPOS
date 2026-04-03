'use client';

import { useState } from 'react';
import { X, Percent, DollarSign, Tag, Trash2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CartItemDiscount {
  type: 'pct' | 'flat';
  value: number;
}

// ─── CartItemModal ────────────────────────────────────────────────────────────

export function CartItemModal({
  item,
  onApply,
  onClose,
}: {
  item: {
    name: string;
    price: number;
    qty: number;
    discount?: CartItemDiscount;
    note?: string;
  };
  onApply: (discount: CartItemDiscount | null, note: string) => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'discount' | 'note'>('discount');

  // Discount state — seed from existing item discount if present
  const [discountType, setDiscountType] = useState<'pct' | 'flat'>(
    item.discount?.type ?? 'pct',
  );
  const [discountValue, setDiscountValue] = useState<string>(
    item.discount ? String(item.discount.value) : '',
  );

  // Note state
  const [note, setNote] = useState(item.note ?? '');

  const NOTE_MAX = 80;

  // ── Effective line price calculation ──
  const linePrice = item.price * item.qty;
  const parsedValue = parseFloat(discountValue);
  const hasDiscount = discountValue !== '' && !isNaN(parsedValue) && parsedValue > 0;

  let effectivePrice = linePrice;
  if (hasDiscount) {
    if (discountType === 'pct') {
      const pct = Math.min(parsedValue, 100);
      effectivePrice = linePrice * (1 - pct / 100);
    } else {
      effectivePrice = Math.max(0, linePrice - parsedValue);
    }
  }

  // ── Apply handler ──
  const handleApply = () => {
    const discount: CartItemDiscount | null =
      hasDiscount ? { type: discountType, value: parsedValue } : null;
    onApply(discount, note.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-2xl bg-[#1a1a2e] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2a2a3a] px-5 py-4">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-white">{item.name}</h2>
            <span className="rounded-md bg-[#2a2a3a] px-1.5 py-0.5 text-[11px] text-gray-400">
              ×{item.qty}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-[#2a2a3a] hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2a2a3a]">
          <button
            onClick={() => setActiveTab('discount')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === 'discount'
                ? 'border-b-2 border-indigo-500 text-indigo-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Discount
          </button>
          <button
            onClick={() => setActiveTab('note')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === 'note'
                ? 'border-b-2 border-indigo-500 text-indigo-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Note
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          {activeTab === 'discount' ? (
            <div className="space-y-4">
              {/* Type toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setDiscountType('pct')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                    discountType === 'pct'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-[#2a2a3a] text-gray-400 hover:text-white'
                  }`}
                >
                  <Percent className="h-4 w-4" />
                  %
                </button>
                <button
                  onClick={() => setDiscountType('flat')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                    discountType === 'flat'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-[#2a2a3a] text-gray-400 hover:text-white'
                  }`}
                >
                  <DollarSign className="h-4 w-4" />
                  $
                </button>
              </div>

              {/* Value input */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-500">
                  {discountType === 'pct' ? '%' : '$'}
                </span>
                <input
                  type="number"
                  min="0"
                  max={discountType === 'pct' ? 100 : undefined}
                  step="0.01"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl bg-[#2a2a3a] py-3 pl-8 pr-4 text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Price preview */}
              <div className="rounded-xl bg-[#0f0f1a] px-4 py-3">
                <div className="mb-1 flex justify-between text-xs text-gray-500">
                  <span>Original</span>
                  <span>${linePrice.toFixed(2)}</span>
                </div>
                {hasDiscount && (
                  <div className="mb-1 flex justify-between text-xs text-red-400">
                    <span>
                      Discount (
                      {discountType === 'pct'
                        ? `${parsedValue}%`
                        : `$${parsedValue.toFixed(2)}`}
                      )
                    </span>
                    <span>−${(linePrice - effectivePrice).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-[#2a2a3a] pt-2 text-sm font-bold text-white">
                  <span>After discount</span>
                  <span className="text-indigo-300">${effectivePrice.toFixed(2)}</span>
                </div>
              </div>

              {/* Remove discount */}
              {item.discount && (
                <button
                  onClick={() => {
                    setDiscountValue('');
                    onApply(null, note.trim());
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm text-red-400 transition-colors hover:bg-red-900/20"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove discount
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={note}
                onChange={(e) => {
                  if (e.target.value.length <= NOTE_MAX) setNote(e.target.value);
                }}
                placeholder="Add a note for the kitchen or customer…"
                rows={4}
                className="w-full resize-none rounded-xl bg-[#2a2a3a] p-3 text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex justify-end">
                <span
                  className={`text-xs ${
                    note.length >= NOTE_MAX ? 'text-red-400' : 'text-gray-600'
                  }`}
                >
                  {note.length}/{NOTE_MAX}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-[#2a2a3a] px-5 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-[#2a2a3a] py-3 text-sm font-semibold text-gray-300 transition-colors hover:bg-[#333347]"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-500"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
