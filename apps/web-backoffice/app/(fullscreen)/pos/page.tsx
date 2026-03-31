'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Monitor, CreditCard, ShoppingCart, Building2, Code2,
  Search, X, Minus, Plus, Trash2, ChefHat, Tablet,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  emoji: string;
}

interface CartItem extends Product {
  qty: number;
  cartKey: string;
}

// ─── Static catalogue ────────────────────────────────────────────────────────

// Deterministic placeholder UUIDs for the static demo catalogue.
// In production these would be real catalog service IDs.
const PRODUCTS: Product[] = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Flat White',    price: 5.50,  category: 'Coffee',   emoji: '☕' },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Iced Latte',    price: 6.00,  category: 'Coffee',   emoji: '🥤' },
  { id: '00000000-0000-0000-0000-000000000003', name: 'Cold Brew',     price: 5.00,  category: 'Coffee',   emoji: '🧊' },
  { id: '00000000-0000-0000-0000-000000000004', name: 'Pour Over',     price: 8.00,  category: 'Coffee',   emoji: '☕' },
  { id: '00000000-0000-0000-0000-000000000005', name: 'Croissant',     price: 4.00,  category: 'Pastries', emoji: '🥐' },
  { id: '00000000-0000-0000-0000-000000000006', name: 'Banana Bread',  price: 4.50,  category: 'Pastries', emoji: '🍞' },
  { id: '00000000-0000-0000-0000-000000000007', name: 'Avocado Toast', price: 14.50, category: 'Food',     emoji: '🥑' },
  { id: '00000000-0000-0000-0000-000000000008', name: 'Eggs Benedict', price: 18.00, category: 'Food',     emoji: '🍳' },
];

const CATEGORIES = ['All', 'Coffee', 'Pastries', 'Food'];

// ─── App switcher bar ────────────────────────────────────────────────────────

const APPS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', color: 'bg-indigo-500' },
  { id: 'pos',       label: 'POS',       icon: CreditCard,      href: '/pos',       color: 'bg-emerald-500' },
  { id: 'kds',       label: 'KDS',       icon: ChefHat,         href: '/kds',       color: 'bg-orange-500' },
  { id: 'kiosk',     label: 'Kiosk',     icon: Tablet,          href: '/kiosk',     color: 'bg-yellow-500' },
] as const;

function AppBar({ current }: { current: string }) {
  return (
    <div className="flex h-10 items-center justify-between border-b border-[#2a2a3a] bg-[#1a1a2a] px-4">
      <div className="flex items-center gap-1">
        {APPS.map((app) => {
          const Icon = app.icon;
          const active = app.id === current;
          return (
            <Link
              key={app.id}
              href={app.href}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'bg-[#2a2a3a] text-white'
                  : 'text-gray-500 hover:bg-[#2a2a3a] hover:text-gray-200'
              }`}
            >
              <Icon className="h-3 w-3" />
              {app.label}
            </Link>
          );
        })}
      </div>
      <span className="text-[10px] text-gray-600">ElevatedPOS</span>
    </div>
  );
}

// ─── Main POS screen ─────────────────────────────────────────────────────────

export default function POSPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');

  const filtered = PRODUCTS.filter(
    (p) =>
      (category === 'All' || p.category === category) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.cartKey === product.id);
      if (existing) return prev.map((i) => i.cartKey === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...product, qty: 1, cartKey: product.id }];
    });
  };

  const removeFromCart = (cartKey: string) => {
    setCart((prev) => {
      const item = prev.find((i) => i.cartKey === cartKey);
      if (!item) return prev;
      if (item.qty === 1) return prev.filter((i) => i.cartKey !== cartKey);
      return prev.map((i) => i.cartKey === cartKey ? { ...i, qty: i.qty - 1 } : i);
    });
  };

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const tax = subtotal * 0.1;
  const total = subtotal + tax;

  const handleCharge = () => {
    if (cart.length === 0) return;
    const params = new URLSearchParams({
      items: JSON.stringify(cart.map((i) => ({ id: i.cartKey, name: i.name, price: i.price, qty: i.qty }))),
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
    });
    router.push(`/pos/payment?${params.toString()}`);
  };

  return (
    <div className="flex h-full flex-col bg-[#1e1e2e]">
      <AppBar current="pos" />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Product panel ── */}
        <div className="flex flex-1 flex-col border-r border-[#2a2a3a] p-3">
          {/* Search */}
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-[#2a2a3a] px-3 py-2">
            <Search className="h-4 w-4 flex-shrink-0 text-gray-500" />
            <input
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
              placeholder="Filter products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')}>
                <X className="h-3.5 w-3.5 text-gray-500 hover:text-gray-300" />
              </button>
            )}
          </div>

          {/* Categories */}
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  category === cat
                    ? 'bg-indigo-500 text-white'
                    : 'bg-[#2a2a3a] text-gray-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-3 gap-2 pb-2 sm:grid-cols-4 lg:grid-cols-5">
              {filtered.map((product) => {
                const inCart = cart.find((i) => i.id === product.id);
                return (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className={`relative flex flex-col items-center rounded-xl p-3 text-center transition-all ${
                      inCart
                        ? 'border border-indigo-500 bg-indigo-950'
                        : 'bg-[#2a2a3a] hover:bg-[#333347]'
                    }`}
                  >
                    <span className="mb-1 text-3xl">{product.emoji}</span>
                    <span className="text-xs font-semibold leading-tight text-white">
                      {product.name}
                    </span>
                    <span className="mt-1 text-xs font-bold text-indigo-300">
                      ${product.price.toFixed(2)}
                    </span>
                    {inCart && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white">
                        {inCart.qty}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Cart panel ── */}
        <div className="flex w-72 flex-col bg-[#16161f] p-3 xl:w-80">
          <h2 className="mb-3 text-base font-bold text-white">Order</h2>

          {cart.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-600">
              <ShoppingCart className="h-10 w-10" />
              <p className="text-sm">Add items to order</p>
            </div>
          ) : (
            <div className="flex-1 space-y-2 overflow-y-auto">
              {cart.map((item) => (
                <div
                  key={item.cartKey}
                  className="flex items-center justify-between rounded-xl bg-[#2a2a3a] p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{item.name}</p>
                    <p className="text-xs text-indigo-300">
                      ${(item.price * item.qty).toFixed(2)}
                    </p>
                  </div>
                  <div className="ml-2 flex items-center gap-1.5">
                    <button
                      onClick={() => removeFromCart(item.cartKey)}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-900 text-white hover:bg-indigo-800"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-4 text-center text-sm font-bold text-white">{item.qty}</span>
                    <button
                      onClick={() => addToCart(item)}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-900 text-white hover:bg-indigo-800"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          <div className="mt-3 border-t border-[#2a2a3a] pt-3">
            <div className="mb-1 flex justify-between text-sm text-gray-400">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="mb-3 flex justify-between text-sm text-gray-400">
              <span>Tax (10%)</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="mb-3 flex justify-between border-t border-[#2a2a3a] pt-2 text-base font-bold text-white">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>

            <button
              onClick={handleCharge}
              disabled={cart.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3.5 text-base font-bold text-white transition-opacity disabled:opacity-40 hover:bg-indigo-400"
            >
              <CreditCard className="h-4 w-4" />
              Charge ${total.toFixed(2)}
            </button>

            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs text-gray-500 hover:text-gray-300"
              >
                <Trash2 className="h-3 w-3" />
                Clear order
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
