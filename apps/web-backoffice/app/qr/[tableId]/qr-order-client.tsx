'use client';

import { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, Plus, Minus, ArrowLeft, CheckCircle, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../../../lib/formatting';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  color?: string;
  sortOrder: number;
}

interface Product {
  id: string;
  name: string;
  description?: string;
  basePrice: number;
  categoryId?: string;
  isSoldInstore: boolean;
  isActive?: boolean;
}

interface CartItem {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

type Step = 'menu' | 'cart' | 'confirm';

// ─── Helpers ──────────────────────────────────────────────────────────────────


// ─── Category chips ───────────────────────────────────────────────────────────

function CategoryChips({
  categories,
  selected,
  onSelect,
}: {
  categories: Category[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      <button
        onClick={() => onSelect('')}
        className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
          selected === ''
            ? 'bg-indigo-600 text-white'
            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
        }`}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id === selected ? '' : cat.id)}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
            selected === cat.id
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}

// ─── Product card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  cartQty,
  onAdd,
  onRemove,
}: {
  product: Product;
  cartQty: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col rounded-2xl bg-gray-900 p-4 shadow">
      <div className="mb-3 h-24 rounded-xl bg-gray-800 flex items-center justify-center">
        <span className="text-3xl">🍽️</span>
      </div>
      <p className="mb-1 font-semibold text-white leading-snug">{product.name}</p>
      {product.description && (
        <p className="mb-2 text-xs text-gray-400 line-clamp-2">{product.description}</p>
      )}
      <p className="mb-3 text-lg font-bold text-indigo-400">{formatCurrency(product.basePrice)}</p>
      <div className="mt-auto flex items-center justify-between">
        {cartQty === 0 ? (
          <button
            onClick={onAdd}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 active:scale-95 transition-transform"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        ) : (
          <div className="flex w-full items-center justify-between rounded-xl bg-indigo-700 px-2">
            <button onClick={onRemove} className="p-2 hover:text-red-300 transition-colors">
              <Minus className="h-4 w-4" />
            </button>
            <span className="font-bold text-white">{cartQty}</span>
            <button onClick={onAdd} className="p-2 hover:text-green-300 transition-colors">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cart screen ──────────────────────────────────────────────────────────────

function CartScreen({
  cart,
  onQuantityChange,
  onBack,
  onPlaceOrder,
  placing,
}: {
  cart: CartItem[];
  onQuantityChange: (productId: string, delta: number) => void;
  onBack: () => void;
  onPlaceOrder: () => void;
  placing: boolean;
}) {
  const total = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-4">
        <button onClick={onBack} className="rounded-lg p-2 hover:bg-gray-800 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-xl font-bold">Your Order</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {cart.map((item) => (
          <div key={item.productId} className="flex items-center gap-3 rounded-xl bg-gray-900 p-3">
            <div className="flex-1">
              <p className="font-semibold text-white">{item.name}</p>
              <p className="text-sm text-indigo-400">{formatCurrency(item.unitPrice)} each</p>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-gray-800 px-2">
              <button onClick={() => onQuantityChange(item.productId, -1)} className="p-2 hover:text-red-300">
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[1.5rem] text-center font-bold">{item.quantity}</span>
              <button onClick={() => onQuantityChange(item.productId, 1)} className="p-2 hover:text-green-300">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <p className="w-16 text-right font-bold text-white">{formatCurrency(item.unitPrice * item.quantity)}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-800 px-4 py-4 space-y-3">
        <div className="flex items-center justify-between text-lg font-bold">
          <span>Total</span>
          <span className="text-indigo-400">{formatCurrency(total)}</span>
        </div>
        <button
          onClick={onPlaceOrder}
          disabled={placing || cart.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-lg font-extrabold text-white hover:bg-indigo-500 disabled:opacity-50 active:scale-95 transition-transform"
        >
          {placing ? 'Placing…' : 'Place Order'}
          {!placing && <ChevronRight className="h-5 w-5" />}
        </button>
        <button
          onClick={() => {/* pay at counter */}}
          className="flex w-full items-center justify-center rounded-2xl border border-gray-700 py-3 text-sm font-semibold text-gray-400 hover:bg-gray-800 transition-colors"
        >
          Pay at Counter
        </button>
      </div>
    </div>
  );
}

// ─── Confirmation screen ──────────────────────────────────────────────────────

function ConfirmScreen({ orderNumber, onDone }: { orderNumber: string; onDone: () => void }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 px-8 text-center">
      <CheckCircle className="h-24 w-24 text-green-400" />
      <div>
        <p className="text-4xl font-extrabold text-white">#{orderNumber}</p>
        <p className="mt-1 text-gray-400">Your order has been received!</p>
      </div>
      <p className="text-sm text-gray-500">A team member will bring your order to the table.</p>
      <button
        onClick={onDone}
        className="rounded-2xl bg-indigo-600 px-8 py-3 font-bold text-white hover:bg-indigo-500 transition-colors"
      >
        Order Again
      </button>
    </div>
  );
}

// ─── Main client ──────────────────────────────────────────────────────────────

export function QrOrderClient({ tableId }: { tableId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currentCategory, setCurrentCategory] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [step, setStep] = useState<Step>('menu');
  const [placing, setPlacing] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [prodRes, catRes] = await Promise.all([
          fetch('/api/proxy/products?limit=200'),
          fetch('/api/proxy/categories'),
        ]);
        const [prodJson, catJson] = await Promise.all([prodRes.json(), catRes.json()]) as [
          { data: Product[] },
          { data: Category[] },
        ];
        setProducts((prodJson.data ?? []).filter((p) => p.isSoldInstore !== false));
        setCategories((catJson.data ?? []).sort((a, b) => a.sortOrder - b.sortOrder));
      } catch {
        setError('Failed to load menu. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { productId: product.id, name: product.name, unitPrice: product.basePrice, quantity: 1 }];
    });
  }, []);

  const changeQty = useCallback((productId: string, delta: number) => {
    setCart((prev) => {
      const updated = prev.map((i) =>
        i.productId === productId ? { ...i, quantity: i.quantity + delta } : i,
      ).filter((i) => i.quantity > 0);
      return updated;
    });
  }, []);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const filteredProducts = currentCategory
    ? products.filter((p) => p.categoryId === currentCategory)
    : products;

  const placeOrder = useCallback(async () => {
    setPlacing(true);
    try {
      const res = await fetch('/api/proxy/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // locationId and registerId required by schema — use fallback defaults for QR
          locationId: '00000000-0000-0000-0000-000000000000',
          registerId: '00000000-0000-0000-0000-000000000000',
          channel: 'qr',
          orderType: 'dine_in',
          tableId,
          lines: cart.map((item) => ({
            productId: item.productId,
            name: item.name,
            sku: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            costPrice: 0,
            taxRate: 0,
            discountAmount: 0,
          })),
        }),
      });
      const json = await res.json() as { data?: { orderNumber?: string } };
      setOrderNumber(json.data?.orderNumber ?? 'N/A');
      setCart([]);
      setStep('confirm');
    } catch {
      setError('Failed to place order. Please try again.');
    } finally {
      setPlacing(false);
    }
  }, [cart, tableId]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-red-400 text-lg">{error}</p>
        <button
          onClick={() => { setError(''); setLoading(true); }}
          className="rounded-xl bg-indigo-600 px-6 py-3 font-bold text-white hover:bg-indigo-500"
        >
          Retry
        </button>
      </div>
    );
  }

  if (step === 'confirm') {
    return <ConfirmScreen orderNumber={orderNumber} onDone={() => { setStep('menu'); }} />;
  }

  if (step === 'cart') {
    return (
      <CartScreen
        cart={cart}
        onQuantityChange={changeQty}
        onBack={() => setStep('menu')}
        onPlaceOrder={placeOrder}
        placing={placing}
      />
    );
  }

  return (
    <div className="mx-auto max-w-md min-h-screen flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950 px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-extrabold text-white">Order</h1>
            <p className="text-sm text-gray-400">Table {tableId}</p>
          </div>
          {cartCount > 0 && (
            <button
              onClick={() => setStep('cart')}
              className="flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-500 transition-colors"
            >
              <ShoppingCart className="h-4 w-4" />
              <span>{cartCount}</span>
            </button>
          )}
        </div>
        <CategoryChips categories={categories} selected={currentCategory} onSelect={setCurrentCategory} />
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          {filteredProducts.map((product) => {
            const cartItem = cart.find((i) => i.productId === product.id);
            return (
              <ProductCard
                key={product.id}
                product={product}
                cartQty={cartItem?.quantity ?? 0}
                onAdd={() => addToCart(product)}
                onRemove={() => changeQty(product.id, -1)}
              />
            );
          })}
        </div>
        {filteredProducts.length === 0 && (
          <div className="py-16 text-center text-gray-600">No items in this category</div>
        )}
      </div>

      {/* Floating cart button */}
      {cartCount > 0 && (
        <div className="sticky bottom-0 border-t border-gray-800 bg-gray-950 p-4">
          <button
            onClick={() => setStep('cart')}
            className="flex w-full items-center justify-between rounded-2xl bg-indigo-600 px-5 py-4 font-bold text-white hover:bg-indigo-500 active:scale-95 transition-transform"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" /> View Order ({cartCount})
            </span>
            <span>{formatCurrency(cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0))}</span>
          </button>
        </div>
      )}
    </div>
  );
}
