'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { LayoutDashboard, CreditCard, ChefHat, Tablet, ShoppingCart, X, Plus } from 'lucide-react';
import DevicePairingScreen from '@/components/device-pairing-screen';
import { getDeviceToken, getDeviceInfo, fetchWithDeviceAuth, type DeviceInfo } from '@/lib/device-auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  tags: string[];
  emoji: string;
  description: string;
  ageRestricted: boolean;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

// API shape returned by the catalog service
interface ApiProduct {
  id: string;
  name: string;
  price: number; // stored in cents
  categoryId?: string;
  categoryName?: string;
  status?: string;
  imageUrl?: string;
  description?: string;
}

interface ApiCategory {
  id: string;
  name: string;
}

// ─── Mock catalogue (fallback when API is unavailable) ────────────────────────

const MOCK_PRODUCTS: Product[] = [
  { id: '1',    name: 'Classic Burger',      price: 18.5,  category: 'Food',     tags: [],         emoji: '🍔', description: 'Beef patty, lettuce, tomato, special sauce',        ageRestricted: false },
  { id: '2',    name: 'Veggie Wrap',         price: 15.0,  category: 'Food',     tags: ['V','GF'], emoji: '🌯', description: 'Grilled vegetables, hummus, rocket',                ageRestricted: false },
  { id: '3',    name: 'Grilled Chicken',     price: 22.0,  category: 'Food',     tags: ['GF'],     emoji: '🍗', description: 'Free-range chicken, seasonal greens, aioli',         ageRestricted: false },
  { id: '4',    name: 'Fish & Chips',        price: 24.0,  category: 'Food',     tags: [],         emoji: '🐟', description: 'Beer battered barramundi, shoestring fries',         ageRestricted: false },
  { id: '5',    name: 'Caesar Salad',        price: 16.0,  category: 'Food',     tags: ['V'],      emoji: '🥗', description: 'Cos lettuce, parmesan, croutons, caesar dressing',  ageRestricted: false },
  { id: '6',    name: 'Flat White',          price: 5.5,   category: 'Drinks',   tags: [],         emoji: '☕', description: 'Single origin espresso, steamed milk',              ageRestricted: false },
  { id: '7',    name: 'Lemon Iced Tea',      price: 6.0,   category: 'Drinks',   tags: ['V','GF'], emoji: '🍋', description: 'House-brewed iced tea with fresh lemon',            ageRestricted: false },
  { id: '8',    name: 'Freshly Squeezed OJ', price: 7.0,   category: 'Drinks',   tags: ['V','GF'], emoji: '🍊', description: 'Cold-pressed orange juice',                         ageRestricted: false },
  { id: 'a1',   name: 'House Red Wine',      price: 12.0,  category: 'Drinks',   tags: ['GF'],     emoji: '🍷', description: 'Australian shiraz, 150ml serve',                    ageRestricted: true  },
  { id: 'a2',   name: 'Craft Beer',          price: 10.0,  category: 'Drinks',   tags: [],         emoji: '🍺', description: 'Local IPA on tap, 285ml',                           ageRestricted: true  },
  { id: '9',    name: 'Chocolate Lava Cake', price: 12.0,  category: 'Desserts', tags: ['V'],      emoji: '🍫', description: 'Warm dark chocolate cake, vanilla bean ice cream',  ageRestricted: false },
  { id: '10',   name: 'Crème Brûlée',        price: 11.0,  category: 'Desserts', tags: ['V','GF'], emoji: '🍮', description: 'Classic French custard with caramelised sugar',    ageRestricted: false },
  { id: '11',   name: 'Garlic Bread',        price: 7.0,   category: 'Extras',   tags: ['V'],      emoji: '🥖', description: 'Sourdough, herb butter, parmesan',                  ageRestricted: false },
  { id: '12',   name: 'Sweet Potato Fries',  price: 9.0,   category: 'Extras',   tags: ['V','GF'], emoji: '🍟', description: 'With smoky chipotle mayo',                          ageRestricted: false },
];

const MOCK_CATEGORIES = ['All', 'Food', 'Drinks', 'Desserts', 'Extras'];

// ─── App switcher bar ────────────────────────────────────────────────────────

const APPS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { id: 'pos',       label: 'POS',       icon: CreditCard,      href: '/pos' },
  { id: 'kds',       label: 'KDS',       icon: ChefHat,         href: '/kds' },
  { id: 'kiosk',     label: 'Kiosk',     icon: Tablet,          href: '/kiosk' },
] as const;

function AppBar({ current, deviceLabel }: { current: string; deviceLabel?: string }) {
  return (
    <div className="flex h-10 items-center justify-between border-b border-[#333] bg-[#111] px-4">
      <div className="flex items-center gap-1">
        {APPS.map((app) => {
          const Icon = app.icon;
          const active = app.id === current;
          return (
            <Link
              key={app.id}
              href={app.href}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                active ? 'bg-[#2a2a2a] text-white' : 'text-gray-600 hover:bg-[#2a2a2a] hover:text-gray-200'
              }`}
            >
              <Icon className="h-3 w-3" />
              {app.label}
            </Link>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        {deviceLabel && (
          <span className="rounded-md bg-[#2a2a2a] px-2 py-0.5 font-mono text-[10px] text-amber-400">
            Device: {deviceLabel}
          </span>
        )}
        <span className="text-[10px] text-gray-700">ElevatedPOS Kiosk</span>
      </div>
    </div>
  );
}

// ─── Attract screen ───────────────────────────────────────────────────────────

function AttractScreen({ onStart }: { onStart: () => void }) {
  return (
    <div
      className="flex flex-1 cursor-pointer flex-col items-center justify-center bg-gradient-to-br from-black via-[#0f0f0f] to-[#1a1a1a] text-center"
      onClick={onStart}
    >
      <div className="mb-8 text-8xl">🍽️</div>
      <h1 className="mb-3 text-5xl font-extrabold tracking-tight text-white">
        Order Here
      </h1>
      <p className="mb-10 text-xl text-gray-400">Tap anywhere to start your order</p>
      <div className="flex items-center gap-3 rounded-full border border-amber-500/40 bg-amber-500/10 px-8 py-4 backdrop-blur">
        <span className="animate-bounce text-2xl">👆</span>
        <span className="text-lg font-semibold text-amber-400">TAP TO START</span>
      </div>
    </div>
  );
}

// ─── Cart sidebar ─────────────────────────────────────────────────────────────

function CartSidebar({
  cart,
  onRemove,
  onAdd,
  onCheckout,
  isLoading,
}: {
  cart: CartItem[];
  onRemove: (id: string) => void;
  onAdd: (id: string) => void;
  onCheckout: () => void;
  isLoading?: boolean;
}) {
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const count = cart.reduce((s, i) => s + i.qty, 0);
  return (
    <div className="flex w-72 flex-col border-l border-[#222] bg-[#0a0a0a] xl:w-80">
      <div className="flex items-center gap-2 border-b border-[#222] px-4 py-3">
        <ShoppingCart className="h-4 w-4 text-amber-400" />
        <span className="font-bold text-white">Your Order</span>
        {count > 0 && (
          <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-black">
            {count}
          </span>
        )}
      </div>

      {cart.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-700">
          <ShoppingCart className="h-10 w-10" />
          <p className="text-sm">No items yet</p>
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {cart.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-xl border border-[#222] bg-[#111] p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{item.name}</p>
                <p className="text-xs text-amber-400">${(item.price * item.qty).toFixed(2)}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onRemove(item.id)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-[#222] text-white hover:bg-[#333]"
                >
                  <X className="h-3 w-3" />
                </button>
                <span className="w-5 text-center text-sm font-bold text-white">{item.qty}</span>
                <button
                  onClick={() => onAdd(item.id)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-black hover:bg-amber-400"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-[#222] p-4">
        <div className="mb-3 flex justify-between text-base font-bold text-white">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
        <button
          onClick={onCheckout}
          disabled={cart.length === 0 || isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 py-4 text-lg font-extrabold text-black disabled:opacity-40 hover:bg-amber-400"
        >
          {isLoading ? (
            <><div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent" /> Placing order…</>
          ) : 'Pay Now'}
        </button>
      </div>
    </div>
  );
}

// ─── Checkout success ─────────────────────────────────────────────────────────

function CheckoutSuccess({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-[#0a0a0a] text-center">
      <div className="text-6xl">✅</div>
      <h2 className="text-3xl font-extrabold text-white">Order Placed!</h2>
      <p className="text-gray-400">Please collect your order at the counter.</p>
      <button
        onClick={onNew}
        className="mt-4 rounded-2xl bg-amber-500 px-10 py-4 text-lg font-extrabold text-black hover:bg-amber-400"
      >
        New Order
      </button>
    </div>
  );
}

// ─── Kiosk terminal (rendered after pairing) ─────────────────────────────────

function KioskTerminal({ deviceInfo }: { deviceInfo: DeviceInfo | null }) {
  const [started, setStarted] = useState(false);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkedOut, setCheckedOut] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [categories, setCategories] = useState<string[]>(MOCK_CATEGORIES);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const locationId = deviceInfo?.locationId ?? '00000000-0000-0000-0000-000000000001';

  // Fetch real catalog data once device is paired
  useEffect(() => {
    if (!deviceInfo) return;

    async function loadCatalog() {
      setLoadingCatalog(true);
      try {
        const [productsRes, categoriesRes] = await Promise.all([
          fetchWithDeviceAuth('/api/proxy/catalog/products?limit=100'),
          fetchWithDeviceAuth('/api/proxy/catalog/categories'),
        ]);

        if (productsRes.ok) {
          const productsData = await productsRes.json() as { data?: ApiProduct[] };
          const apiProducts = productsData.data ?? [];
          let categoryMap: Record<string, string> = {};
          if (categoriesRes.ok) {
            const categoriesData = await categoriesRes.json() as { data?: ApiCategory[] };
            const apiCategories = categoriesData.data ?? [];
            categoryMap = Object.fromEntries(apiCategories.map((c) => [c.id, c.name]));
            setCategories(['All', ...apiCategories.map((c) => c.name)]);
          }

          const mapped: Product[] = apiProducts.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.price / 100,
            category: (p.categoryId && categoryMap[p.categoryId]) ?? p.categoryName ?? 'Other',
            // API products have no dietary tag data — show no tags
            tags: [],
            emoji: '🛒',
            description: p.description ?? '',
            ageRestricted: false,
          }));
          setProducts(mapped);
        }
      } catch {
        // Network error — keep mock data
      } finally {
        setLoadingCatalog(false);
      }
    }

    loadCatalog();
  }, [deviceInfo]);

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (category === 'All' || p.category === category) &&
          p.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [products, category, search],
  );

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) return prev.map((i) => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: product.id, name: product.name, price: product.price, qty: 1 }];
    });
  };

  const increaseQty = (id: string) => {
    const product = products.find((p) => p.id === id);
    if (product) addToCart(product);
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => {
      const item = prev.find((i) => i.id === id);
      if (!item) return prev;
      if (item.qty === 1) return prev.filter((i) => i.id !== id);
      return prev.map((i) => i.id === id ? { ...i, qty: i.qty - 1 } : i);
    });
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || checkingOut) return;
    setCheckingOut(true);
    try {
      const orderNumber = String(Math.floor(1000 + Math.random() * 9000));
      const orderId = `kiosk-${Date.now()}`;

      await fetch('/api/kds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_order',
          paymentMethod: 'kiosk',
          order: {
            orderId,
            orderNumber,
            orderType: 'dine_in',
            channel: 'kiosk',
            locationId,
            lines: cart.map((i) => ({ name: i.name, qty: i.qty, price: i.price, modifiers: [] })),
            createdAt: new Date().toISOString(),
            status: 'new',
          },
        }),
      });
      setCheckedOut(true);
    } finally {
      setCheckingOut(false);
    }
  };

  const handleNew = () => {
    setCart([]);
    setCheckedOut(false);
    setStarted(false);
    setCategory('All');
    setSearch('');
  };

  return (
    <div className="relative flex h-full flex-col bg-black">
      <AppBar current="kiosk" deviceLabel={deviceInfo?.label ?? deviceInfo?.deviceId?.slice(0, 8)} />

      {loadingCatalog && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/50">
          <div className="flex items-center gap-3 rounded-xl bg-[#1a1a1a] px-5 py-3 text-sm text-white shadow-xl">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
            Loading menu…
          </div>
        </div>
      )}

      {!started ? (
        <AttractScreen onStart={() => setStarted(true)} />
      ) : checkedOut ? (
        <CheckoutSuccess onNew={handleNew} />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Menu */}
          <div className="flex flex-1 flex-col bg-black">
            {/* Search */}
            <div className="border-b border-[#1a1a1a] px-4 py-3">
              <input
                className="w-full rounded-xl border border-[#333] bg-[#1a1a1a] px-4 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-500"
                placeholder="Search menu…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto border-b border-[#1a1a1a] px-4 py-2.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`flex-shrink-0 rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                    category === cat
                      ? 'bg-amber-500 text-black'
                      : 'bg-[#1a1a1a] text-gray-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Product grid */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((product) => {
                  const inCart = cart.find((i) => i.id === product.id);
                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="flex flex-col rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-4 text-left transition-all hover:border-amber-500/40 hover:bg-[#222]"
                    >
                      <div className="relative mb-2 flex h-16 items-center justify-center rounded-xl bg-[#111]">
                        <span className="text-4xl">{product.emoji}</span>
                        {product.ageRestricted && (
                          <span className="absolute right-1 top-1 rounded-md bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            18+
                          </span>
                        )}
                        {inCart && (
                          <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-black">
                            {inCart.qty}
                          </span>
                        )}
                      </div>
                      {product.tags.filter(Boolean).length > 0 && (
                        <div className="mb-1.5 flex flex-wrap gap-1">
                          {product.tags.filter(Boolean).map((tag) => (
                            <span key={tag} className="rounded-md border border-green-800 bg-green-950/40 px-1.5 py-0.5 text-[9px] font-bold text-green-400">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="mb-1 font-bold leading-tight text-white">{product.name}</p>
                      <p className="mb-2 line-clamp-2 text-[11px] leading-tight text-gray-600">
                        {product.description}
                      </p>
                      <div className="mt-auto flex items-center justify-between">
                        <span className="font-extrabold text-amber-400">${product.price.toFixed(2)}</span>
                        <span className={`flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold transition-colors ${inCart ? 'bg-green-600 text-white' : 'bg-amber-500 text-black hover:bg-amber-400'}`}>
                          {inCart ? `+${inCart.qty}` : '+'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cart sidebar */}
          <CartSidebar
            cart={cart}
            onRemove={removeFromCart}
            onAdd={increaseQty}
            onCheckout={handleCheckout}
            isLoading={checkingOut}
          />
        </div>
      )}
    </div>
  );
}

// ─── Page — device pairing gate ───────────────────────────────────────────────

export default function KioskPage() {
  const [mounted, setMounted] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [paired, setPaired] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = getDeviceToken();
    if (token) {
      setDeviceInfo(getDeviceInfo());
      setPaired(true);
    }
  }, []);

  if (!mounted) return null;

  if (!paired) {
    return (
      <DevicePairingScreen
        role="kiosk"
        onPaired={(info) => {
          setDeviceInfo(info);
          setPaired(true);
        }}
      />
    );
  }

  return <KioskTerminal deviceInfo={deviceInfo} />;
}
