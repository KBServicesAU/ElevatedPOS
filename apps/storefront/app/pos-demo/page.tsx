'use client';

import Link from 'next/link';
import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Product {
  id: string;
  name: string;
  price: number;
  category: Category;
}

interface OrderItem {
  product: Product;
  quantity: number;
}

type Category = 'Coffee' | 'Food' | 'Drinks' | 'Desserts' | 'Sides';
type CategoryFilter = 'All' | Category;

type PaymentMethod = 'Cash' | 'Card' | 'Split';

type PaymentStage =
  | { step: 'select' }
  | { step: 'cash'; tendered: string }
  | { step: 'card-processing' }
  | { step: 'card-approved' }
  | { step: 'complete' };

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const CATEGORIES: CategoryFilter[] = ['All', 'Coffee', 'Food', 'Drinks', 'Desserts', 'Sides'];

const PRODUCTS: Product[] = [
  // Coffee
  { id: 'c1', name: 'Flat White', price: 4.5, category: 'Coffee' },
  { id: 'c2', name: 'Cappuccino', price: 4.5, category: 'Coffee' },
  { id: 'c3', name: 'Long Black', price: 4.0, category: 'Coffee' },
  { id: 'c4', name: 'Latte', price: 5.0, category: 'Coffee' },
  { id: 'c5', name: 'Espresso', price: 3.5, category: 'Coffee' },
  { id: 'c6', name: 'Mocha', price: 5.5, category: 'Coffee' },
  { id: 'c7', name: 'Hot Chocolate', price: 5.0, category: 'Coffee' },
  { id: 'c8', name: 'Chai Latte', price: 5.5, category: 'Coffee' },
  // Food
  { id: 'f1', name: 'Avocado Toast', price: 18.0, category: 'Food' },
  { id: 'f2', name: 'Eggs Benedict', price: 22.0, category: 'Food' },
  { id: 'f3', name: 'Bacon & Egg Roll', price: 12.0, category: 'Food' },
  { id: 'f4', name: 'Smashed Burger', price: 19.0, category: 'Food' },
  { id: 'f5', name: 'Caesar Salad', price: 16.0, category: 'Food' },
  { id: 'f6', name: 'Fish & Chips', price: 24.0, category: 'Food' },
  // Drinks
  { id: 'd1', name: 'Fresh OJ', price: 7.0, category: 'Drinks' },
  { id: 'd2', name: 'Green Smoothie', price: 9.0, category: 'Drinks' },
  { id: 'd3', name: 'Iced Latte', price: 6.0, category: 'Drinks' },
  { id: 'd4', name: 'Kombucha', price: 7.5, category: 'Drinks' },
  { id: 'd5', name: 'Sparkling Water', price: 4.0, category: 'Drinks' },
  { id: 'd6', name: 'Lemonade', price: 5.5, category: 'Drinks' },
  // Desserts
  { id: 'ds1', name: 'Banana Bread', price: 6.5, category: 'Desserts' },
  { id: 'ds2', name: 'Chocolate Brownie', price: 7.0, category: 'Desserts' },
  { id: 'ds3', name: 'Blueberry Muffin', price: 6.0, category: 'Desserts' },
  { id: 'ds4', name: 'Tiramisu', price: 12.0, category: 'Desserts' },
  { id: 'ds5', name: 'Affogato', price: 8.0, category: 'Desserts' },
  // Sides
  { id: 's1', name: 'Sourdough Toast', price: 4.0, category: 'Sides' },
  { id: 's2', name: 'Hash Brown', price: 3.5, category: 'Sides' },
  { id: 's3', name: 'Extra Bacon', price: 4.5, category: 'Sides' },
  { id: 's4', name: 'Side Salad', price: 6.0, category: 'Sides' },
  { id: 's5', name: 'Sweet Potato Fries', price: 8.0, category: 'Sides' },
];

const GST_RATE = 0.1;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function currency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/* ---------- Top bar ---------- */

function DemoBar() {
  return (
    <header className="h-14 flex-shrink-0 flex items-center justify-between px-4 sm:px-6 bg-[#0a0a0a] border-b border-white/[0.06]">
      <Link href="/" className="text-base font-bold tracking-tight text-white hover:text-violet-400 transition-colors">
        ElevatedPOS
      </Link>
      <span className="hidden sm:block text-xs uppercase tracking-widest text-neutral-500">
        Interactive Demo
      </span>
      <Link
        href="/onboard"
        className="text-sm font-medium px-4 py-1.5 rounded-full bg-violet-600 text-white hover:bg-violet-500 transition-colors"
      >
        Get started
      </Link>
    </header>
  );
}

/* ---------- Mobile gate ---------- */

function MobileGate() {
  return (
    <div className="flex lg:hidden flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-violet-600/20 flex items-center justify-center mb-2">
        <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-violet-400">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-white">Demo works best on desktop</h2>
      <p className="text-neutral-400 text-sm max-w-xs">
        The interactive POS demo is optimised for larger screens. Open this page on a desktop or laptop for the full experience.
      </p>
      <Link
        href="/onboard"
        className="mt-4 inline-flex items-center gap-2 text-sm font-medium px-6 py-2.5 rounded-full bg-violet-600 text-white hover:bg-violet-500 transition-colors"
      >
        Get started instead
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </Link>
    </div>
  );
}

/* ---------- Category tabs ---------- */

function CategoryTabs({
  active,
  onChange,
}: {
  active: CategoryFilter;
  onChange: (c: CategoryFilter) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto px-4 py-3 scrollbar-hide">
      {CATEGORIES.map((cat) => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          className={`flex-shrink-0 text-sm font-medium px-4 py-1.5 rounded-full border transition-colors ${
            active === cat
              ? 'bg-violet-600 border-violet-600 text-white'
              : 'border-white/[0.08] text-neutral-400 hover:text-white hover:border-white/[0.16]'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}

/* ---------- Product card ---------- */

function ProductCard({
  product,
  onAdd,
}: {
  product: Product;
  onAdd: (p: Product) => void;
}) {
  return (
    <button
      onClick={() => onAdd(product)}
      className="flex flex-col items-start gap-1 p-4 rounded-xl bg-neutral-900 border border-white/[0.06] hover:bg-neutral-800 hover:border-white/[0.12] transition-all text-left active:scale-[0.97]"
    >
      <span className="text-sm font-semibold text-white leading-snug">{product.name}</span>
      <span className="text-sm text-neutral-400">{currency(product.price)}</span>
    </button>
  );
}

/* ---------- Product grid ---------- */

function ProductGrid({
  category,
  onAdd,
}: {
  category: CategoryFilter;
  onAdd: (p: Product) => void;
}) {
  const filtered = category === 'All' ? PRODUCTS : PRODUCTS.filter((p) => p.category === category);

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4">
      <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} onAdd={onAdd} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Order line item ---------- */

function OrderLine({
  item,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  item: OrderItem;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 group">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{item.product.name}</p>
        <p className="text-xs text-neutral-500">{currency(item.product.price)} each</p>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={item.quantity === 1 ? onRemove : onDecrement}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-white/[0.08] text-neutral-400 hover:text-white hover:border-white/[0.16] transition-colors text-sm"
        >
          {item.quantity === 1 ? (
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          ) : (
            '\u2212'
          )}
        </button>
        <span className="w-7 text-center text-sm font-medium text-white tabular-nums">{item.quantity}</span>
        <button
          onClick={onIncrement}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-white/[0.08] text-neutral-400 hover:text-white hover:border-white/[0.16] transition-colors text-sm"
        >
          +
        </button>
      </div>
      <span className="w-16 text-right text-sm font-medium text-white tabular-nums">
        {currency(item.product.price * item.quantity)}
      </span>
    </div>
  );
}

/* ---------- Order panel ---------- */

function OrderPanel({
  items,
  orderNumber,
  onIncrement,
  onDecrement,
  onRemove,
  onHold,
  onPay,
}: {
  items: OrderItem[];
  orderNumber: number;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onRemove: (id: string) => void;
  onHold: () => void;
  onPay: () => void;
}) {
  const subtotal = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const gst = subtotal * GST_RATE;
  const total = subtotal + gst;

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f] border-l border-white/[0.06]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <h2 className="text-sm font-semibold text-white">Current Order</h2>
        <span className="text-xs text-neutral-500 tabular-nums">#{String(orderNumber).padStart(3, '0')}</span>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-12">
            <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-neutral-600">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
            </div>
            <p className="text-xs text-neutral-600">Tap a product to start an order</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {items.map((item) => (
              <OrderLine
                key={item.product.id}
                item={item}
                onIncrement={() => onIncrement(item.product.id)}
                onDecrement={() => onDecrement(item.product.id)}
                onRemove={() => onRemove(item.product.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Totals & actions */}
      <div className="border-t border-white/[0.06] px-4 pt-3 pb-4 space-y-3">
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-neutral-500">
            <span>Subtotal</span>
            <span className="tabular-nums">{currency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-xs text-neutral-500">
            <span>GST (10%)</span>
            <span className="tabular-nums">{currency(gst)}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold text-white pt-1">
            <span>Total</span>
            <span className="tabular-nums">{currency(total)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onHold}
            disabled={items.length === 0}
            className="flex-1 text-sm font-medium py-2.5 rounded-lg border border-white/[0.1] text-neutral-300 hover:text-white hover:border-white/[0.2] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Hold Order
          </button>
          <button
            onClick={onPay}
            disabled={items.length === 0}
            className="flex-[2] text-sm font-semibold py-2.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Pay {items.length > 0 ? currency(total) : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Held orders toast ---------- */

function HeldToast({ count, onDismiss }: { count: number; onDismiss: () => void }) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="absolute bottom-4 left-4 z-20 flex items-center gap-3 px-4 py-2.5 rounded-lg bg-neutral-800 border border-white/[0.08] shadow-lg"
        >
          <span className="text-sm text-neutral-300">
            {count} order{count > 1 ? 's' : ''} on hold
          </span>
          <button onClick={onDismiss} className="text-xs text-violet-400 hover:text-violet-300 font-medium">
            Dismiss
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------- Payment modal ---------- */

function PaymentModal({
  total,
  items,
  onClose,
  onComplete,
}: {
  total: number;
  items: OrderItem[];
  onClose: () => void;
  onComplete: () => void;
}) {
  const [stage, setStage] = useState<PaymentStage>({ step: 'select' });

  const handleCash = useCallback(() => {
    setStage({ step: 'cash', tendered: '' });
  }, []);

  const handleCard = useCallback(() => {
    setStage({ step: 'card-processing' });
    setTimeout(() => {
      setStage({ step: 'card-approved' });
    }, 1500);
  }, []);

  const handleSplit = useCallback(() => {
    // For demo purposes, treat split the same as card
    setStage({ step: 'card-processing' });
    setTimeout(() => {
      setStage({ step: 'card-approved' });
    }, 1500);
  }, []);

  const handleCashComplete = useCallback(() => {
    setStage({ step: 'complete' });
  }, []);

  const tenderedNum = stage.step === 'cash' ? parseFloat(stage.tendered) || 0 : 0;
  const changeDue = tenderedNum - total;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={stage.step === 'select' ? onClose : undefined}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
        className="bg-[#141414] border border-white/[0.08] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Select payment method */}
        {stage.step === 'select' && (
          <div className="p-6 space-y-5">
            <div className="text-center space-y-1">
              <p className="text-xs uppercase tracking-widest text-neutral-500">Total due</p>
              <p className="text-3xl font-bold text-white tabular-nums">{currency(total)}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  { method: 'Cash' as PaymentMethod, icon: CashIcon, handler: handleCash },
                  { method: 'Card' as PaymentMethod, icon: CardIcon, handler: handleCard },
                  { method: 'Split' as PaymentMethod, icon: SplitIcon, handler: handleSplit },
                ] as const
              ).map(({ method, icon: Icon, handler }) => (
                <button
                  key={method}
                  onClick={handler}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl bg-neutral-900 border border-white/[0.06] hover:bg-neutral-800 hover:border-white/[0.12] transition-all active:scale-[0.97]"
                >
                  <Icon />
                  <span className="text-sm font-medium text-neutral-300">{method}</span>
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="w-full text-sm text-neutral-500 hover:text-neutral-300 transition-colors py-2"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Cash tendered */}
        {stage.step === 'cash' && (
          <div className="p-6 space-y-5">
            <div className="text-center space-y-1">
              <p className="text-xs uppercase tracking-widest text-neutral-500">Cash payment</p>
              <p className="text-2xl font-bold text-white tabular-nums">{currency(total)}</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="tendered" className="block text-xs text-neutral-500">Amount tendered</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-lg">$</span>
                <input
                  id="tendered"
                  type="number"
                  min="0"
                  step="0.01"
                  autoFocus
                  value={stage.tendered}
                  onChange={(e) => setStage({ step: 'cash', tendered: e.target.value })}
                  className="w-full pl-8 pr-4 py-3 rounded-lg bg-neutral-900 border border-white/[0.08] text-white text-lg tabular-nums outline-none focus:border-violet-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Quick tender buttons */}
            <div className="grid grid-cols-4 gap-2">
              {[
                Math.ceil(total),
                Math.ceil(total / 5) * 5,
                Math.ceil(total / 10) * 10,
                Math.ceil(total / 20) * 20,
              ]
                .filter((v, i, arr) => arr.indexOf(v) === i)
                .slice(0, 4)
                .map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setStage({ step: 'cash', tendered: amount.toFixed(2) })}
                    className="text-sm font-medium py-2 rounded-lg border border-white/[0.08] text-neutral-400 hover:text-white hover:border-white/[0.16] transition-colors tabular-nums"
                  >
                    {currency(amount)}
                  </button>
                ))}
            </div>

            {tenderedNum >= total && (
              <div className="text-center py-2">
                <p className="text-xs text-neutral-500">Change due</p>
                <p className="text-xl font-bold text-emerald-400 tabular-nums">{currency(changeDue)}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setStage({ step: 'select' })}
                className="flex-1 text-sm font-medium py-2.5 rounded-lg border border-white/[0.1] text-neutral-300 hover:text-white transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCashComplete}
                disabled={tenderedNum < total}
                className="flex-[2] text-sm font-semibold py-2.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Complete
              </button>
            </div>
          </div>
        )}

        {/* Card processing */}
        {stage.step === 'card-processing' && (
          <div className="p-6 flex flex-col items-center gap-4 py-12">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className="w-10 h-10 border-2 border-violet-600 border-t-transparent rounded-full"
            />
            <p className="text-sm text-neutral-400">Processing payment...</p>
            <p className="text-2xl font-bold text-white tabular-nums">{currency(total)}</p>
          </div>
        )}

        {/* Card approved */}
        {stage.step === 'card-approved' && (
          <div className="p-6 flex flex-col items-center gap-4 py-12">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', duration: 0.5, bounce: 0.4 }}
              className="w-14 h-14 rounded-full bg-emerald-600/20 flex items-center justify-center"
            >
              <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-emerald-400">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>
            <p className="text-lg font-semibold text-white">Payment Approved</p>
            <p className="text-2xl font-bold text-emerald-400 tabular-nums">{currency(total)}</p>
            <button
              onClick={() => setStage({ step: 'complete' })}
              className="mt-2 text-sm font-semibold px-8 py-2.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500 transition-colors"
            >
              View Receipt
            </button>
          </div>
        )}

        {/* Complete / receipt */}
        {stage.step === 'complete' && (
          <div className="p-6 space-y-4">
            <div className="text-center space-y-1 pb-2">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', duration: 0.5, bounce: 0.4 }}
                className="w-12 h-12 rounded-full bg-emerald-600/20 flex items-center justify-center mx-auto mb-3"
              >
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-emerald-400">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </motion.div>
              <p className="text-xs uppercase tracking-widest text-neutral-500">Order complete</p>
            </div>

            <div className="bg-neutral-900 rounded-xl border border-white/[0.06] p-4 space-y-3">
              <div className="space-y-1.5">
                {items.map((item) => (
                  <div key={item.product.id} className="flex justify-between text-sm">
                    <span className="text-neutral-300">
                      {item.quantity}x {item.product.name}
                    </span>
                    <span className="text-neutral-400 tabular-nums">{currency(item.product.price * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-white/[0.06] pt-2 space-y-1">
                <div className="flex justify-between text-xs text-neutral-500">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{currency(total / (1 + GST_RATE))}</span>
                </div>
                <div className="flex justify-between text-xs text-neutral-500">
                  <span>GST</span>
                  <span className="tabular-nums">{currency(total - total / (1 + GST_RATE))}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-white pt-1">
                  <span>Total</span>
                  <span className="tabular-nums">{currency(total)}</span>
                </div>
              </div>
            </div>

            <button
              onClick={onComplete}
              className="w-full text-sm font-semibold py-3 rounded-lg bg-violet-600 text-white hover:bg-violet-500 transition-colors"
            >
              New Order
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ---------- Icons ---------- */

function CashIcon() {
  return (
    <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-emerald-400">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-blue-400">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}

function SplitIcon() {
  return (
    <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-amber-400">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page component                                                */
/* ------------------------------------------------------------------ */

export default function DemoPage() {
  const [category, setCategory] = useState<CategoryFilter>('All');
  const [items, setItems] = useState<OrderItem[]>([]);
  const [orderNumber, setOrderNumber] = useState(1);
  const [showPayment, setShowPayment] = useState(false);
  const [heldCount, setHeldCount] = useState(0);

  /* -- Order mutations -- */

  const addItem = useCallback((product: Product) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) => (i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const incrementItem = useCallback((id: string) => {
    setItems((prev) => prev.map((i) => (i.product.id === id ? { ...i, quantity: i.quantity + 1 } : i)));
  }, []);

  const decrementItem = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.product.id === id && i.quantity > 1 ? { ...i, quantity: i.quantity - 1 } : i)),
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== id));
  }, []);

  const holdOrder = useCallback(() => {
    if (items.length === 0) return;
    setHeldCount((c) => c + 1);
    setItems([]);
    setOrderNumber((n) => n + 1);
  }, [items.length]);

  const startPayment = useCallback(() => {
    if (items.length === 0) return;
    setShowPayment(true);
  }, [items.length]);

  const completeOrder = useCallback(() => {
    setShowPayment(false);
    setItems([]);
    setOrderNumber((n) => n + 1);
  }, []);

  /* -- Derived -- */

  const total = useMemo(() => {
    const subtotal = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
    return subtotal + subtotal * GST_RATE;
  }, [items]);

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a] text-white overflow-hidden">
      <DemoBar />

      {/* Mobile gate */}
      <MobileGate />

      {/* Desktop POS layout */}
      <div className="hidden lg:flex flex-1 min-h-0">
        {/* Left panel: products */}
        <div className="flex-[7] flex flex-col min-h-0 relative">
          <CategoryTabs active={category} onChange={setCategory} />
          <ProductGrid category={category} onAdd={addItem} />
          <HeldToast count={heldCount} onDismiss={() => setHeldCount(0)} />
        </div>

        {/* Right panel: order */}
        <div className="flex-[3] min-w-[320px] max-w-[400px]">
          <OrderPanel
            items={items}
            orderNumber={orderNumber}
            onIncrement={incrementItem}
            onDecrement={decrementItem}
            onRemove={removeItem}
            onHold={holdOrder}
            onPay={startPayment}
          />
        </div>
      </div>

      {/* Payment modal */}
      <AnimatePresence>
        {showPayment && (
          <PaymentModal
            total={total}
            items={items}
            onClose={() => setShowPayment(false)}
            onComplete={completeOrder}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
