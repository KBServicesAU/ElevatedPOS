'use client';

import { useState } from 'react';

interface CartItem {
  id: string;
  name: string;
  price: number;
}

export function AddToCartButton({ product }: { product: CartItem }) {
  const [added, setAdded] = useState(false);
  const [quantity, setQuantity] = useState(1);

  function handleAdd() {
    const cart = JSON.parse(
      localStorage.getItem('elevatedpos_cart') ?? '[]'
    ) as (CartItem & { quantity: number })[];
    const existing = cart.find((i) => i.id === product.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({ ...product, quantity });
    }
    localStorage.setItem('elevatedpos_cart', JSON.stringify(cart));
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">Qty</label>
        <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="px-3 py-2 hover:bg-gray-50 text-lg font-medium"
          >
            −
          </button>
          <span className="px-4 py-2 font-medium">{quantity}</span>
          <button
            onClick={() => setQuantity((q) => q + 1)}
            className="px-3 py-2 hover:bg-gray-50 text-lg font-medium"
          >
            +
          </button>
        </div>
      </div>
      <button
        onClick={handleAdd}
        className="w-full py-4 rounded-xl text-white font-semibold text-lg transition-all bg-gray-900 hover:bg-gray-800 active:scale-95"
      >
        {added ? '✓ Added to cart!' : 'Add to Cart'}
      </button>
    </div>
  );
}
