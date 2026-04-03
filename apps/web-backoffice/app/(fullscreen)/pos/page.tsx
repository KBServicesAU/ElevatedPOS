'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, CreditCard, ShoppingCart,
  Search, X, Minus, Plus, Trash2, ChefHat, Tablet,
  User, Settings, Banknote, DollarSign, LogOut,
} from 'lucide-react';
import DevicePairingScreen from '@/components/device-pairing-screen';
import { getDeviceToken, getDeviceInfo, fetchWithDeviceAuth, type DeviceInfo } from '@/lib/device-auth';
import { StaffScreen, type StaffMember } from './staff-screen';
import { CartItemModal, type CartItemDiscount } from './cart-item-modal';
import { ProductDetailSheet } from './product-detail-sheet';
import { CustomerSearchModal, type Customer } from './customer-search-modal';
import { FloatEntryModal } from './float-entry-modal';
import { AdjustFloatModal } from './adjust-float-modal';
import { SettingsModal } from './settings-modal';
import { usePrinter } from './printer-context';
import {
  getTillSession, createTillSession, addTillAdjustment, type TillSession,
} from './till-session';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  price: number; // GST-inclusive
  category: string;
  emoji: string;
  description?: string;
}

interface CartItem extends Product {
  qty: number;
  cartKey: string;
  discount?: CartItemDiscount;
  note?: string;
}

interface ApiProduct {
  id: string;
  name: string;
  price: number; // cents, GST-inclusive
  categoryId?: string;
  categoryName?: string;
  status?: string;
  description?: string;
}

interface ApiCategory {
  id: string;
  name: string;
}

// ─── GST helpers (Australian GST-inclusive pricing) ──────────────────────────

/** Given a GST-inclusive price, return the GST component (price / 11). */
function gstComponent(inclusivePrice: number) {
  return Math.round((inclusivePrice / 11) * 100) / 100;
}

/** Effective cart item total after discount. */
function itemTotal(item: CartItem): number {
  const base = item.price * item.qty;
  if (!item.discount) return base;
  if (item.discount.type === 'pct') return base * (1 - item.discount.value / 100);
  return Math.max(0, base - item.discount.value);
}

// ─── Mock catalogue ───────────────────────────────────────────────────────────

const MOCK_PRODUCTS: Product[] = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Flat White',    price: 5.50,  category: 'Coffee',   emoji: '☕', description: 'Single origin espresso, steamed milk' },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Iced Latte',    price: 6.00,  category: 'Coffee',   emoji: '🥤', description: 'Cold espresso over ice' },
  { id: '00000000-0000-0000-0000-000000000003', name: 'Cold Brew',     price: 5.00,  category: 'Coffee',   emoji: '🧊', description: '12-hour cold brew' },
  { id: '00000000-0000-0000-0000-000000000004', name: 'Pour Over',     price: 8.00,  category: 'Coffee',   emoji: '☕', description: 'Single origin pour over' },
  { id: '00000000-0000-0000-0000-000000000005', name: 'Croissant',     price: 4.00,  category: 'Pastries', emoji: '🥐', description: 'Buttery French croissant' },
  { id: '00000000-0000-0000-0000-000000000006', name: 'Banana Bread',  price: 4.50,  category: 'Pastries', emoji: '🍞', description: 'House-made banana bread' },
  { id: '00000000-0000-0000-0000-000000000007', name: 'Avocado Toast', price: 14.50, category: 'Food',     emoji: '🥑', description: 'Sourdough, avocado, dukkah' },
  { id: '00000000-0000-0000-0000-000000000008', name: 'Eggs Benedict', price: 18.00, category: 'Food',     emoji: '🍳', description: 'Poached eggs, hollandaise' },
];

const MOCK_CATEGORIES = ['All', 'Coffee', 'Pastries', 'Food'];

// ─── App switcher bar ────────────────────────────────────────────────────────

const APPS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', color: 'bg-indigo-500' },
  { id: 'pos',       label: 'POS',       icon: CreditCard,      href: '/pos',       color: 'bg-emerald-500' },
  { id: 'kds',       label: 'KDS',       icon: ChefHat,         href: '/kds',       color: 'bg-orange-500' },
  { id: 'kiosk',     label: 'Kiosk',     icon: Tablet,          href: '/kiosk',     color: 'bg-yellow-500' },
] as const;

function AppBar({
  current,
  deviceLabel,
  staff,
  onStaffLogout,
  onSettings,
  onNoSale,
}: {
  current: string;
  deviceLabel?: string;
  staff?: StaffMember | null;
  onStaffLogout?: () => void;
  onSettings?: () => void;
  onNoSale?: () => void;
}) {
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
                active ? 'bg-[#2a2a3a] text-white' : 'text-gray-500 hover:bg-[#2a2a3a] hover:text-gray-200'
              }`}
            >
              <Icon className="h-3 w-3" />
              {app.label}
            </Link>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        {onNoSale && (
          <button
            onClick={onNoSale}
            title="No Sale (open drawer)"
            className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-[#2a2a3a] hover:text-gray-200"
          >
            <Banknote className="h-3.5 w-3.5" />
          </button>
        )}
        {onSettings && (
          <button
            onClick={onSettings}
            title="Settings"
            className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-[#2a2a3a] hover:text-gray-200"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        )}
        {deviceLabel && (
          <span className="rounded-md bg-[#2a2a3a] px-2 py-0.5 font-mono text-[10px] text-indigo-300">
            {deviceLabel}
          </span>
        )}
        {staff && (
          <div className="flex items-center gap-1.5 rounded-md bg-[#2a2a3a] px-2 py-0.5">
            <User className="h-3 w-3 text-indigo-300" />
            <span className="text-[10px] text-gray-300">
              {staff.firstName} {staff.lastName[0]}.
            </span>
            <button onClick={onStaffLogout} title="Switch staff" className="text-gray-500 hover:text-gray-300">
              <LogOut className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── POS terminal ─────────────────────────────────────────────────────────────

function POSTerminalInner({ deviceInfo, staff }: { deviceInfo: DeviceInfo | null; staff: StaffMember }) {
  const router = useRouter();
  const { receiptPort, connectPrinter } = usePrinter();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [categories, setCategories] = useState<string[]>(MOCK_CATEGORIES);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Modal states
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
  const [longPressProduct, setLongPressProduct] = useState<Product | null>(null);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdjustFloat, setShowAdjustFloat] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Till session
  const [tillSession, setTillSession] = useState<TillSession | null>(() => getTillSession());
  const [showFloatEntry, setShowFloatEntry] = useState(() => !getTillSession());

  // Staff logout callback (lifted to page level)
  const [staffLogout, setStaffLogout] = useState(false);

  // Long-press tracking
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch catalog
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
            const catData = await categoriesRes.json() as { data?: ApiCategory[] };
            const apiCats = catData.data ?? [];
            categoryMap = Object.fromEntries(apiCats.map((c) => [c.id, c.name]));
            setCategories(['All', ...apiCats.map((c) => c.name)]);
          }
          setProducts(apiProducts.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.price / 100, // cents → dollars, GST-inclusive
            category: (p.categoryId && categoryMap[p.categoryId]) ?? p.categoryName ?? 'Other',
            emoji: '🛒',
            description: p.description,
          })));
        }
      } catch { /* keep mock */ }
      finally { setLoadingCatalog(false); }
    }
    loadCatalog();
  }, [deviceInfo]);

  const filtered = products.filter(
    (p) => (category === 'All' || p.category === category) &&
            p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.cartKey === product.id);
      if (existing) return prev.map((i) => i.cartKey === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...product, qty: 1, cartKey: product.id }];
    });
  }, []);

  const removeFromCart = useCallback((cartKey: string) => {
    setCart((prev) => {
      const item = prev.find((i) => i.cartKey === cartKey);
      if (!item) return prev;
      if (item.qty === 1) return prev.filter((i) => i.cartKey !== cartKey);
      return prev.map((i) => i.cartKey === cartKey ? { ...i, qty: i.qty - 1 } : i);
    });
  }, []);

  // GST-inclusive totals
  const cartTotal = cart.reduce((sum, i) => sum + itemTotal(i), 0);
  const gst = gstComponent(cartTotal);
  const exGst = cartTotal - gst;

  const handleCharge = () => {
    if (cart.length === 0) return;
    const params = new URLSearchParams({
      items: JSON.stringify(cart.map((i) => ({
        id: i.cartKey, name: i.name, price: i.price, qty: i.qty,
        discount: i.discount ? JSON.stringify(i.discount) : undefined,
        note: i.note,
      }))),
      total: cartTotal.toFixed(2),
      exGst: exGst.toFixed(2),
      gst: gst.toFixed(2),
      customerId: selectedCustomer?.id ?? '',
      customerName: selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : '',
      staffId: staff.id,
      staffName: `${staff.firstName} ${staff.lastName}`,
    });
    router.push(`/pos/payment?${params.toString()}`);
  };

  // No Sale — open cash drawer
  const handleNoSale = useCallback(async () => {
    if (tillSession) {
      const updated = addTillAdjustment({
        type: 'no_sale', amount: 0,
        staffId: staff.id, staffName: `${staff.firstName} ${staff.lastName}`,
      });
      if (updated) setTillSession(updated);
    }
    if (receiptPort) {
      const { openCashDrawer } = await import('./receipt-printer');
      await openCashDrawer(receiptPort).catch(() => {});
    }
  }, [tillSession, staff, receiptPort]);

  // Long-press handlers
  const handlePointerDown = useCallback((product: Product) => {
    pressTimerRef.current = setTimeout(() => {
      setLongPressProduct(product);
    }, 600);
  }, []);

  const handlePointerUp = useCallback((product: Product) => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
      // Short press = add to cart (only if detail sheet isn't about to show)
      if (!longPressProduct) addToCart(product);
    }
  }, [addToCart, longPressProduct]);

  const handlePointerLeave = useCallback(() => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }, []);

  if (staffLogout) {
    // Signal parent to show staff selection
    return null;
  }

  return (
    <div className="relative flex h-full flex-col bg-[#1e1e2e]">
      <AppBar
        current="pos"
        deviceLabel={deviceInfo?.label ?? deviceInfo?.deviceId?.slice(0, 8)}
        staff={staff}
        onStaffLogout={() => setStaffLogout(true)}
        onSettings={() => setShowSettings(true)}
        onNoSale={handleNoSale}
      />

      {loadingCatalog && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/40">
          <div className="flex items-center gap-3 rounded-xl bg-[#2a2a3a] px-5 py-3 text-sm text-white shadow-xl">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
            Loading catalogue…
          </div>
        </div>
      )}

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
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  category === cat ? 'bg-indigo-500 text-white' : 'bg-[#2a2a3a] text-gray-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Product grid — tap to add, hold to view details */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-3 gap-2 pb-2 sm:grid-cols-4 lg:grid-cols-5">
              {filtered.map((product) => {
                const inCart = cart.find((i) => i.id === product.id);
                return (
                  <button
                    key={product.id}
                    onPointerDown={() => handlePointerDown(product)}
                    onPointerUp={() => handlePointerUp(product)}
                    onPointerLeave={handlePointerLeave}
                    className={`relative flex flex-col items-center rounded-xl p-3 text-center transition-all select-none ${
                      inCart ? 'border border-indigo-500 bg-indigo-950' : 'bg-[#2a2a3a] hover:bg-[#333347]'
                    }`}
                  >
                    <span className="mb-1 text-3xl">{product.emoji}</span>
                    <span className="text-xs font-semibold leading-tight text-white">{product.name}</span>
                    <span className="mt-1 text-xs font-bold text-indigo-300">${product.price.toFixed(2)}</span>
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
          {/* Customer header */}
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Order</h2>
            <button
              onClick={() => setShowCustomerSearch(true)}
              className="flex items-center gap-1 rounded-lg bg-[#2a2a3a] px-2.5 py-1 text-xs text-gray-400 hover:text-white"
            >
              <User className="h-3 w-3" />
              {selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : 'Add customer'}
              {selectedCustomer && (
                <X
                  className="ml-1 h-3 w-3 text-gray-600 hover:text-red-400"
                  onClick={(e) => { e.stopPropagation(); setSelectedCustomer(null); }}
                />
              )}
            </button>
          </div>

          {cart.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-600">
              <ShoppingCart className="h-10 w-10" />
              <p className="text-sm">Add items to order</p>
            </div>
          ) : (
            <div className="flex-1 space-y-2 overflow-y-auto">
              {cart.map((item) => (
                <button
                  key={item.cartKey}
                  onClick={() => setEditingCartItem(item)}
                  className="flex w-full items-center justify-between rounded-xl bg-[#2a2a3a] p-2.5 text-left hover:bg-[#333347]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <p className="truncate text-sm font-medium text-white">{item.name}</p>
                      {item.discount && (
                        <span className="flex-shrink-0 rounded-full bg-yellow-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          {item.discount.type === 'pct' ? `-${item.discount.value}%` : `-$${item.discount.value}`}
                        </span>
                      )}
                    </div>
                    {item.note && (
                      <p className="truncate text-xs italic text-amber-300/70">📝 {item.note}</p>
                    )}
                    <p className="text-xs text-indigo-300">${itemTotal(item).toFixed(2)}</p>
                  </div>
                  <div className="ml-2 flex items-center gap-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFromCart(item.cartKey); }}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-900 text-white hover:bg-indigo-800"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-4 text-center text-sm font-bold text-white">{item.qty}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); addToCart(item); }}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-900 text-white hover:bg-indigo-800"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Totals — GST-inclusive breakdown */}
          <div className="mt-3 border-t border-[#2a2a3a] pt-3">
            <div className="mb-1 flex justify-between text-xs text-gray-500">
              <span>Ex-GST</span>
              <span>${exGst.toFixed(2)}</span>
            </div>
            <div className="mb-3 flex justify-between text-xs text-gray-500">
              <span>GST (10%)</span>
              <span>${gst.toFixed(2)}</span>
            </div>
            <div className="mb-1 flex justify-between border-t border-[#2a2a3a] pt-2 text-base font-bold text-white">
              <span>Total <span className="text-[10px] font-normal text-gray-500">inc. GST</span></span>
              <span>${cartTotal.toFixed(2)}</span>
            </div>

            {/* Float adjustment button */}
            {tillSession && (
              <button
                onClick={() => setShowAdjustFloat(true)}
                className="mb-2 flex w-full items-center justify-center gap-1 rounded-lg border border-[#2a2a3a] py-1.5 text-xs text-gray-500 hover:text-gray-300"
              >
                <DollarSign className="h-3 w-3" />
                Adjust Float
              </button>
            )}

            <button
              onClick={handleCharge}
              disabled={cart.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3.5 text-base font-bold text-white transition-opacity disabled:opacity-40 hover:bg-indigo-400"
            >
              <CreditCard className="h-4 w-4" />
              Charge ${cartTotal.toFixed(2)}
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

      {/* ── Modals ── */}

      {showFloatEntry && (
        <div className="absolute inset-0 z-50">
          <FloatEntryModal
            onConfirm={(amount) => {
              const session = createTillSession(
                amount, staff.id, `${staff.firstName} ${staff.lastName}`,
                deviceInfo?.locationId ?? '',
              );
              setTillSession(session);
              setShowFloatEntry(false);
            }}
          />
        </div>
      )}

      {editingCartItem && (
        <CartItemModal
          item={editingCartItem}
          onApply={(discount, note) => {
            setCart((prev) =>
              prev.map((i) =>
                i.cartKey === editingCartItem.cartKey
                  ? { ...i, discount: discount ?? undefined, note: note || undefined }
                  : i,
              ),
            );
            setEditingCartItem(null);
          }}
          onClose={() => setEditingCartItem(null)}
        />
      )}

      {longPressProduct && (
        <ProductDetailSheet
          product={longPressProduct}
          onAddToCart={() => { addToCart(longPressProduct); setLongPressProduct(null); }}
          onClose={() => setLongPressProduct(null)}
        />
      )}

      {showCustomerSearch && (
        <CustomerSearchModal
          onSelect={(customer) => { setSelectedCustomer(customer); setShowCustomerSearch(false); }}
          onClose={() => setShowCustomerSearch(false)}
        />
      )}

      {showAdjustFloat && tillSession && (
        <AdjustFloatModal
          staffId={staff.id}
          staffName={`${staff.firstName} ${staff.lastName}`}
          onConfirm={(type, amount, reason) => {
            const updated = addTillAdjustment({ type, amount, reason, staffId: staff.id, staffName: `${staff.firstName} ${staff.lastName}` });
            if (updated) setTillSession(updated);
            setShowAdjustFloat(false);
          }}
          onClose={() => setShowAdjustFloat(false)}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onConnect={(printerType, method) => connectPrinter(printerType, method).catch(() => {})}
        />
      )}
    </div>
  );
}

function POSTerminal({ deviceInfo, staff, onStaffLogout }: { deviceInfo: DeviceInfo | null; staff: StaffMember; onStaffLogout: () => void }) {
  return (
    <POSTerminalInnerWrapper deviceInfo={deviceInfo} staff={staff} onStaffLogout={onStaffLogout} />
  );
}

function POSTerminalInnerWrapper({ deviceInfo, staff, onStaffLogout }: { deviceInfo: DeviceInfo | null; staff: StaffMember; onStaffLogout: () => void }) {
  const [staffedOut, setStaffedOut] = useState(false);
  useEffect(() => { if (staffedOut) { setStaffedOut(false); onStaffLogout(); } }, [staffedOut, onStaffLogout]);
  // Use a key to reset when staff changes
  return <POSTerminalInner key={staff.id} deviceInfo={deviceInfo} staff={staff} />;
}

// ─── Page — pairing → staff → POS ─────────────────────────────────────────────

export default function POSPage() {
  const [mounted, setMounted] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [paired, setPaired] = useState(false);
  const [staff, setStaff] = useState<StaffMember | null>(null);

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
        role="pos"
        onPaired={(info) => { setDeviceInfo(info); setPaired(true); }}
      />
    );
  }

  if (!staff) {
    return (
      <StaffScreen
        deviceInfo={deviceInfo}
        onSelect={(s) => setStaff(s)}
      />
    );
  }

  return (
    <POSTerminal
      deviceInfo={deviceInfo}
      staff={staff}
      onStaffLogout={() => setStaff(null)}
    />
  );
}
