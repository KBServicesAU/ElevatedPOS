import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable } from 'react-native';
import { usePosStore } from '../../store/pos';
import { useCatalogStore, type CatalogProduct } from '../../store/catalog';
import { useDeviceStore } from '../../store/device';
import { useAuthStore } from '../../store/auth';
import { useCustomerDisplayStore } from '../../store/customer-display';
import { usePrinterStore } from '../../store/printers';
import { printReceipt, isConnected as isPrinterConnected, connectPrinter } from '../../lib/printer';
import CustomerDisplay from '../../components/CustomerDisplay';
import { useRouter } from 'expo-router';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const CATEGORY_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#3b82f6',
];

function catColor(index: number, explicit?: string | null): string {
  return explicit || CATEGORY_COLORS[index % CATEGORY_COLORS.length]!;
}

function parsePrice(v: string | number): number {
  return typeof v === 'number' ? v : parseFloat(v) || 0;
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function PosSellScreen() {
  const { cart, addItem, removeItem, clearCart, customerName, customerId, setCustomer } =
    usePosStore();
  const { products, categories, loading, error, fetchAll } = useCatalogStore();
  const { identity } = useDeviceStore();

  const { settings: displaySettings, syncTransaction, showThankYou, hydrate: hydrateDisplay } =
    useCustomerDisplayStore();

  const router = useRouter();
  const authEmployee = useAuthStore((s) => s.employee);
  const authLogout = useAuthStore((s) => s.logout);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [charging, setCharging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Payment method modal
  const [showPayment, setShowPayment] = useState(false);
  const [cashTendered, setCashTendered] = useState('');

  // Cart item edit modal
  const [editingCartItem, setEditingCartItem] = useState<{ id: string; name: string; qty: number; price: number } | null>(null);
  const [itemDiscount, setItemDiscount] = useState('');
  const [itemNote, setItemNote] = useState('');

  // Order discount modal
  const [showOrderDiscount, setShowOrderDiscount] = useState(false);
  const [orderDiscountStr, setOrderDiscountStr] = useState('');
  const [orderDiscountType, setOrderDiscountType] = useState<'%' | '$'>('%');
  const [orderDiscountAmount, setOrderDiscountAmount] = useState(0);

  // Product detail modal (long-press)
  const [detailProduct, setDetailProduct] = useState<CatalogProduct | null>(null);

  // Fetch catalog + hydrate customer display on mount
  useEffect(() => {
    fetchAll();
    hydrateDisplay();
  }, []);

  // Pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  // ── Category colour map ──────────────────────────────────────────
  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c, i) => m.set(c.id, catColor(i, c.color)));
    return m;
  }, [categories]);

  // ── Client-side filtering ────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = products;
    if (selectedCategoryId) {
      list = list.filter((p) => p.categoryId === selectedCategoryId);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku && p.sku.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [products, selectedCategoryId, search]);

  // ── Cart totals (tax-inclusive — AU GST) ─────────────────────────
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discountedTotal = orderDiscountAmount > 0 ? Math.max(0, subtotal - orderDiscountAmount) : subtotal;
  const total = discountedTotal;
  const gst = total / 11; // GST portion of the tax-inclusive total
  const itemCount = cart.reduce((s, i) => s + i.qty, 0);

  // ── Sync cart → customer display ──────────────────────────────────
  useEffect(() => {
    if (displaySettings.enabled) {
      syncTransaction({
        items: cart.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
        total,
        gst,
        itemCount,
        customerName,
      });
    }
  }, [cart, customerName, displaySettings.enabled]);

  // ── Add product to cart ──────────────────────────────────────────
  function handleAdd(p: CatalogProduct) {
    addItem({
      id: p.id,
      name: p.name,
      price: parsePrice(p.basePrice),
      categoryColor: p.categoryId ? colorMap.get(p.categoryId) : undefined,
    });
  }

  // ── Charge ───────────────────────────────────────────────────────
  async function handleCharge() {
    if (cart.length === 0) return;
    setCharging(true);

    const authToken = useAuthStore.getState().employeeToken;
    const authEmployee = useAuthStore.getState().employee;
    const printerConfig = usePrinterStore.getState().config;
    const orderTotal = total;
    const orderGst = +gst.toFixed(2);
    const orderItems = cart.map((i) => ({
      productId: i.id,
      name: i.name,
      quantity: i.qty,
      unitPrice: i.price,
      costPrice: 0,
      taxRate: 10,
    }));

    let orderNumber = `P${Math.floor(100 + Math.random() * 900)}`;

    try {
      const base = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';
      const token = authToken ?? identity?.deviceToken ?? '';
      const res = await fetch(`${base}/api/v1/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          locationId: identity?.locationId,
          registerId: identity?.registerId || undefined,
          channel: 'pos',
          orderType: 'retail',
          lines: orderItems,
          ...(customerId ? { customerId } : {}),
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        orderNumber = data.orderNumber ?? orderNumber;
      }
    } catch {
      // Offline — use fallback order number
    }

    // Auto-print receipt if configured
    if (printerConfig.autoPrint && printerConfig.type) {
      try {
        if (!isPrinterConnected()) await connectPrinter();
        await printReceipt({
          storeName: 'ElevatedPOS',
          orderNumber,
          items: cart.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
          subtotal: orderTotal - orderGst,
          gst: orderGst,
          total: orderTotal,
          paymentMethod: 'Card',
          cashierName: authEmployee
            ? `${authEmployee.firstName} ${authEmployee.lastName}`
            : undefined,
        });
      } catch {
        // Print failed — don't block order
      }
    }

    clearCart();
    if (displaySettings.enabled) showThankYou();
    Alert.alert('Order Placed', `Order #${orderNumber} — $${orderTotal.toFixed(2)}`);
    setCharging(false);
  }

  // ── Render product card ──────────────────────────────────────────
  function renderProduct({ item }: { item: CatalogProduct }) {
    const price = parsePrice(item.basePrice);
    const inCart = cart.find((c) => c.id === item.id);
    const cc =
      item.categoryId ? (colorMap.get(item.categoryId) ?? '#6366f1') : '#6366f1';

    return (
      <TouchableOpacity
        style={[styles.card, inCart && styles.cardActive]}
        onPress={() => handleAdd(item)}
        onLongPress={() => setDetailProduct(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.cardColorBar, { backgroundColor: cc }]} />
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={styles.cardFooter}>
            <Text style={styles.cardPrice}>${price.toFixed(2)}</Text>
            {inCart && (
              <View style={styles.cardBadge}>
                <Text style={styles.cardBadgeText}>{inCart.qty}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // ── Handle payment method selection ──────────────────────────────
  function handlePayCard() {
    setShowPayment(false);
    handleCharge();
  }

  function handlePayCash() {
    const tendered = parseFloat(cashTendered) || 0;
    if (tendered < total) {
      Alert.alert('Insufficient', `Need at least $${total.toFixed(2)}`);
      return;
    }
    const change = tendered - total;
    setShowPayment(false);
    setCashTendered('');
    // Process as cash
    handleCharge();
    if (change > 0) {
      Alert.alert('Change Due', `$${change.toFixed(2)}`);
    }
  }

  function applyOrderDiscount() {
    const val = parseFloat(orderDiscountStr) || 0;
    if (val <= 0) return;
    const amt = orderDiscountType === '%' ? (subtotal * val / 100) : val;
    setOrderDiscountAmount(Math.min(amt, subtotal));
    setShowOrderDiscount(false);
    setOrderDiscountStr('');
  }

  function handleSwitchEmployee() {
    authLogout();
    router.replace('/employee-login');
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* ═══ Staff Header Bar ═══ */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#141425', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1e1e2e' }}>
        <Text style={{ fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 0.5 }}>ElevatedPOS</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {authEmployee && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>
                  {authEmployee.firstName.charAt(0)}{authEmployee.lastName.charAt(0)}
                </Text>
              </View>
              <Text style={{ color: '#ccc', fontSize: 12, fontWeight: '600' }}>{authEmployee.firstName}</Text>
            </View>
          )}
          <TouchableOpacity onPress={handleSwitchEmployee} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#2a2a3a' }}>
            <Text style={{ color: '#888', fontSize: 11, fontWeight: '600' }}>Switch</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.layout}>
        {/* ═══════════ LEFT: Products ═══════════ */}
        <View style={styles.leftPane}>
          {/* Search + Customer */}
          <View style={styles.topRow}>
            <View style={styles.searchWrap}>
              <Ionicons
                name="search"
                size={16}
                color="#555"
                style={{ marginLeft: 10 }}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Search products..."
                placeholderTextColor="#444"
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
              />
              {search !== '' && (
                <TouchableOpacity
                  onPress={() => setSearch('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="close-circle"
                    size={16}
                    color="#555"
                    style={{ marginRight: 10 }}
                  />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[styles.custBtn, customerName ? styles.custBtnActive : null]}
              onPress={() => {
                if (customerName) {
                  Alert.alert('Customer', customerName, [
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () => setCustomer(null, null),
                    },
                    { text: 'OK' },
                  ]);
                } else {
                  // TODO: Open customer search/picker modal
                  Alert.alert('Customer', 'Customer selection coming soon');
                }
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name="person"
                size={16}
                color={customerName ? '#6366f1' : '#555'}
              />
              {customerName ? (
                <Text style={styles.custName} numberOfLines={1}>
                  {customerName}
                </Text>
              ) : null}
            </TouchableOpacity>
          </View>

          {/* Category filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.catBar}
            contentContainerStyle={styles.catBarInner}
          >
            <TouchableOpacity
              style={[styles.chip, !selectedCategoryId && styles.chipActive]}
              onPress={() => setSelectedCategoryId(null)}
            >
              <Text
                style={[
                  styles.chipText,
                  !selectedCategoryId && styles.chipTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
            {categories.map((cat, idx) => {
              const active = selectedCategoryId === cat.id;
              const c = catColor(idx, cat.color);
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.chip,
                    active
                      ? { backgroundColor: c, borderColor: c }
                      : { borderColor: `${c}44` },
                  ]}
                  onPress={() =>
                    setSelectedCategoryId(active ? null : cat.id)
                  }
                >
                  {!active && (
                    <View style={[styles.chipDot, { backgroundColor: c }]} />
                  )}
                  <Text
                    style={[
                      styles.chipText,
                      active && styles.chipTextActive,
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Product grid */}
          {loading && products.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#6366f1" />
              <Text style={styles.centerText}>Loading catalog...</Text>
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Ionicons name="alert-circle" size={36} color="#ef4444" />
              <Text style={styles.centerTextErr}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={fetchAll}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="cube-outline" size={36} color="#444" />
              <Text style={styles.centerText}>
                {search ? 'No matching products' : 'No products found'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(p) => p.id}
              numColumns={4}
              renderItem={renderProduct}
              contentContainerStyle={styles.grid}
              showsVerticalScrollIndicator={false}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          )}
        </View>

        {/* ═══════════ RIGHT: Cart ═══════════ */}
        <View style={styles.cartPanel}>
          <View style={styles.cartHead}>
            <Text style={styles.cartTitle}>Order</Text>
            {itemCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{itemCount}</Text>
              </View>
            )}
          </View>

          {cart.length === 0 ? (
            <View style={styles.cartEmpty}>
              <Ionicons name="cart-outline" size={36} color="#2a2a3a" />
              <Text style={styles.cartEmptyText}>Tap products to add</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.cartList}
              showsVerticalScrollIndicator={false}
            >
              {cart.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.cartRow}
                  onPress={() => { setEditingCartItem(item); setItemDiscount(''); setItemNote(''); }}
                  activeOpacity={0.7}
                >
                  <View style={styles.cartItemLeft}>
                    <View
                      style={[
                        styles.cartDot,
                        { backgroundColor: item.categoryColor ?? '#6366f1' },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cartItemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.cartItemSub}>
                        ${item.price.toFixed(2)} ea
                      </Text>
                    </View>
                  </View>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => removeItem(item.id)}
                    >
                      <Text style={styles.qtyBtnLabel}>
                        {item.qty === 1 ? '×' : '−'}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyNum}>{item.qty}</Text>
                    <TouchableOpacity
                      style={[styles.qtyBtn, styles.qtyBtnPlus]}
                      onPress={() => addItem(item)}
                    >
                      <Text style={styles.qtyBtnLabel}>+</Text>
                    </TouchableOpacity>
                    <Text style={styles.lineTotal}>
                      ${(item.price * item.qty).toFixed(2)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {cart.length > 0 && (
            <View style={styles.totalsWrap}>
              {orderDiscountAmount > 0 && (
                <View style={styles.totalLine}>
                  <Text style={[styles.totalLabel, { color: '#ef4444' }]}>Discount</Text>
                  <Text style={[styles.totalValue, { color: '#ef4444' }]}>-${orderDiscountAmount.toFixed(2)}</Text>
                </View>
              )}
              <View style={styles.totalLine}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
              </View>
              <Text style={styles.gstNote}>
                Incl. GST ${gst.toFixed(2)}
              </Text>

              <TouchableOpacity
                style={[
                  styles.chargeBtn,
                  (charging || cart.length === 0) && styles.chargeBtnOff,
                ]}
                onPress={() => setShowPayment(true)}
                disabled={charging || cart.length === 0}
                activeOpacity={0.85}
              >
                <Text style={styles.chargeText}>
                  {charging
                    ? 'Processing...'
                    : `Charge $${total.toFixed(2)}`}
                </Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity style={[styles.clearBtn, { flex: 1 }]} onPress={() => setShowOrderDiscount(true)}>
                  <Text style={[styles.clearText, { color: '#f59e0b' }]}>Discount</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.clearBtn, { flex: 1 }]} onPress={() => { clearCart(); setOrderDiscountAmount(0); }}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* ═══ Payment Method Modal ═══ */}
      <Modal visible={showPayment} transparent animationType="fade" onRequestClose={() => setShowPayment(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setShowPayment(false)}>
          <Pressable style={{ backgroundColor: '#1a1a2e', borderRadius: 20, padding: 24, width: 340, borderWidth: 1, borderColor: '#2a2a3a' }} onPress={() => {}}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#fff', marginBottom: 20, textAlign: 'center' }}>Payment — ${total.toFixed(2)}</Text>
            <TouchableOpacity style={{ backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 10 }} onPress={handlePayCard}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>Card / EFTPOS</Text>
            </TouchableOpacity>
            <View style={{ backgroundColor: '#141425', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 10 }}>
              <Text style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>Cash Tendered</Text>
              <TextInput
                style={{ backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 20, color: '#fff', textAlign: 'center', borderWidth: 1, borderColor: '#2a2a3a' }}
                value={cashTendered}
                onChangeText={setCashTendered}
                keyboardType="decimal-pad"
                placeholder={`$${total.toFixed(2)}`}
                placeholderTextColor="#444"
              />
              {cashTendered && parseFloat(cashTendered) >= total && (
                <Text style={{ color: '#22c55e', fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 8 }}>
                  Change: ${(parseFloat(cashTendered) - total).toFixed(2)}
                </Text>
              )}
              <TouchableOpacity
                style={{ backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 }}
                onPress={handlePayCash}
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>Pay Cash</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setShowPayment(false)} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: '#666', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══ Cart Item Edit Modal (Discount/Note) ═══ */}
      <Modal visible={!!editingCartItem} transparent animationType="fade" onRequestClose={() => setEditingCartItem(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setEditingCartItem(null)}>
          <Pressable style={{ backgroundColor: '#1a1a2e', borderRadius: 20, padding: 24, width: 340, borderWidth: 1, borderColor: '#2a2a3a' }} onPress={() => {}}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 4 }}>{editingCartItem?.name}</Text>
            <Text style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>{editingCartItem?.qty}x @ ${editingCartItem?.price.toFixed(2)}</Text>
            <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>Discount ($)</Text>
            <TextInput
              style={{ backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: '#fff', borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 12 }}
              value={itemDiscount}
              onChangeText={setItemDiscount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#444"
            />
            <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>Note</Text>
            <TextInput
              style={{ backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#fff', borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 16 }}
              value={itemNote}
              onChangeText={setItemNote}
              placeholder="e.g. No onions"
              placeholderTextColor="#444"
            />
            <TouchableOpacity
              style={{ backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
              onPress={() => {
                // TODO: Apply discount/note to the cart item in store
                Alert.alert('Saved', `Discount: $${itemDiscount || '0'}, Note: ${itemNote || 'none'}`);
                setEditingCartItem(null);
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Apply</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══ Order Discount Modal ═══ */}
      <Modal visible={showOrderDiscount} transparent animationType="fade" onRequestClose={() => setShowOrderDiscount(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setShowOrderDiscount(false)}>
          <Pressable style={{ backgroundColor: '#1a1a2e', borderRadius: 20, padding: 24, width: 340, borderWidth: 1, borderColor: '#2a2a3a' }} onPress={() => {}}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 16 }}>Order Discount</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: orderDiscountType === '%' ? '#6366f1' : '#141425', borderWidth: 1, borderColor: '#2a2a3a', alignItems: 'center' }}
                onPress={() => setOrderDiscountType('%')}
              >
                <Text style={{ color: orderDiscountType === '%' ? '#fff' : '#888', fontWeight: '700' }}>Percentage %</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: orderDiscountType === '$' ? '#6366f1' : '#141425', borderWidth: 1, borderColor: '#2a2a3a', alignItems: 'center' }}
                onPress={() => setOrderDiscountType('$')}
              >
                <Text style={{ color: orderDiscountType === '$' ? '#fff' : '#888', fontWeight: '700' }}>Dollar $</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={{ backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 24, color: '#fff', textAlign: 'center', borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 16 }}
              value={orderDiscountStr}
              onChangeText={setOrderDiscountStr}
              keyboardType="decimal-pad"
              placeholder={orderDiscountType === '%' ? '10' : '5.00'}
              placeholderTextColor="#444"
            />
            <TouchableOpacity
              style={{ backgroundColor: '#f59e0b', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
              onPress={applyOrderDiscount}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Apply Discount</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══ Product Detail Modal (Long-Press) ═══ */}
      <Modal visible={!!detailProduct} transparent animationType="fade" onRequestClose={() => setDetailProduct(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setDetailProduct(null)}>
          <Pressable style={{ backgroundColor: '#1a1a2e', borderRadius: 20, padding: 24, width: 380, maxHeight: '70%', borderWidth: 1, borderColor: '#2a2a3a' }} onPress={() => {}}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 8 }}>{detailProduct?.name}</Text>
            <Text style={{ fontSize: 18, color: '#6366f1', fontWeight: '700', marginBottom: 12 }}>
              ${parseFloat(String(detailProduct?.basePrice ?? '0')).toFixed(2)}
            </Text>
            {detailProduct?.sku && (
              <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                <Text style={{ color: '#666', fontSize: 13, width: 80 }}>SKU</Text>
                <Text style={{ color: '#ccc', fontSize: 13 }}>{detailProduct.sku}</Text>
              </View>
            )}
            {detailProduct?.categoryId && (
              <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                <Text style={{ color: '#666', fontSize: 13, width: 80 }}>Category</Text>
                <Text style={{ color: '#ccc', fontSize: 13 }}>{categories.find(c => c.id === detailProduct.categoryId)?.name ?? '—'}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              <Text style={{ color: '#666', fontSize: 13, width: 80 }}>Status</Text>
              <Text style={{ color: detailProduct?.isActive ? '#22c55e' : '#ef4444', fontSize: 13 }}>{detailProduct?.isActive ? 'Active' : 'Inactive'}</Text>
            </View>
            <TouchableOpacity
              style={{ backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 }}
              onPress={() => { if (detailProduct) handleAdd(detailProduct); setDetailProduct(null); }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Add to Cart</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDetailProduct(null)} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: '#666', fontSize: 14 }}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Customer Display for dual-screen */}
      {displaySettings.enabled && <CustomerDisplay />}
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  layout: { flex: 1, flexDirection: 'row' },

  /* ── Left pane ── */
  leftPane: {
    flex: 2.2,
    borderRightWidth: 1,
    borderRightColor: '#1e1e2e',
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 6,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141425',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    height: 38,
  },
  searchInput: {
    flex: 1,
    color: '#ccc',
    fontSize: 13,
    paddingHorizontal: 8,
    height: 38,
  },
  custBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#141425',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    paddingHorizontal: 12,
    height: 38,
  },
  custBtnActive: { borderColor: '#6366f1', backgroundColor: '#1a1a35' },
  custName: {
    fontSize: 12,
    color: '#6366f1',
    fontWeight: '600',
    maxWidth: 80,
  },

  /* ── Category bar ── */
  catBar: { maxHeight: 44, marginTop: 6 },
  catBarInner: { paddingHorizontal: 8, gap: 6, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#141425',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 12, color: '#999', fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  /* ── Product grid ── */
  grid: { padding: 6, paddingBottom: 20 },
  card: {
    flex: 1,
    backgroundColor: '#141425',
    borderRadius: 10,
    margin: 3,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    overflow: 'hidden',
    minHeight: 80,
  },
  cardActive: { borderColor: '#6366f1', backgroundColor: '#1a1a35' },
  cardColorBar: { height: 3 },
  cardBody: {
    padding: 8,
    flex: 1,
    justifyContent: 'space-between',
  },
  cardName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ccc',
    lineHeight: 15,
    marginBottom: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardPrice: { fontSize: 13, fontWeight: '800', color: '#6366f1' },
  cardBadge: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cardBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  /* ── Center states ── */
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  centerText: { fontSize: 14, color: '#555' },
  centerTextErr: {
    fontSize: 13,
    color: '#ef4444',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  retryBtn: {
    backgroundColor: '#1e1e2e',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  retryText: { color: '#ccc', fontWeight: '600', fontSize: 13 },

  /* ── Right pane (cart) ── */
  cartPanel: {
    flex: 1,
    backgroundColor: '#0a0a14',
    padding: 12,
    flexDirection: 'column',
  },
  cartHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  cartTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  cartBadge: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  cartBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  cartEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.35,
  },
  cartEmptyText: { fontSize: 13, color: '#666', marginTop: 8 },

  cartList: { flex: 1 },
  cartRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2a',
  },
  cartItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cartDot: { width: 8, height: 8, borderRadius: 4 },
  cartItemName: { fontSize: 13, fontWeight: '600', color: '#ccc' },
  cartItemSub: { fontSize: 11, color: '#555', marginTop: 1 },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 16,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#2a2a3a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnPlus: { backgroundColor: '#6366f1' },
  qtyBtnLabel: { fontSize: 14, color: '#fff', fontWeight: '700' },
  qtyNum: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    minWidth: 18,
    textAlign: 'center',
  },
  lineTotal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    marginLeft: 'auto',
  },

  /* ── Totals ── */
  totalsWrap: {
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
    paddingTop: 10,
  },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  totalLabel: { fontSize: 17, fontWeight: '800', color: '#fff' },
  totalValue: { fontSize: 19, fontWeight: '900', color: '#6366f1' },
  gstNote: { fontSize: 11, color: '#555', marginBottom: 12 },

  chargeBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  chargeBtnOff: { opacity: 0.4, shadowOpacity: 0, elevation: 0 },
  chargeText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  clearBtn: { paddingVertical: 6, alignItems: 'center' },
  clearText: { fontSize: 12, color: '#444' },
});
