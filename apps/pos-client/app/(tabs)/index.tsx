import { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ProductSearch from '../../components/ProductSearch';
import type { Product, ModifierGroup } from '../../components/ProductSearch';
import type { SelectedModifiers } from '../../components/ModifierModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocalProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  emoji: string;
}

interface CartItem extends LocalProduct {
  qty: number;
  modifiers?: Array<{ name: string; price: number }>;
  /** Unique key when the same product has different modifier sets */
  cartKey: string;
}

// TODO: Replace hardcoded product catalogue with API call to GET /api/v1/catalog/products
// ─── Static catalogue (fallback / offline) ────────────────────────────────────

const PRODUCTS: LocalProduct[] = [
  { id: 'p1', name: 'Flat White',     price: 5.50,  category: 'Coffee',   emoji: '☕' },
  { id: 'p2', name: 'Iced Latte',     price: 6.00,  category: 'Coffee',   emoji: '🥤' },
  { id: 'p3', name: 'Cold Brew',      price: 5.00,  category: 'Coffee',   emoji: '🧊' },
  { id: 'p4', name: 'Pour Over',      price: 8.00,  category: 'Coffee',   emoji: '☕' },
  { id: 'p5', name: 'Croissant',      price: 4.00,  category: 'Pastries', emoji: '🥐' },
  { id: 'p6', name: 'Banana Bread',   price: 4.50,  category: 'Pastries', emoji: '🍞' },
  { id: 'p7', name: 'Avocado Toast',  price: 14.50, category: 'Food',     emoji: '🥑' },
  { id: 'p8', name: 'Eggs Benedict',  price: 18.00, category: 'Food',     emoji: '🍳' },
];

const CATEGORIES = ['All', 'Coffee', 'Pastries', 'Food'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert catalogue Product (price in cents) to local CartItem */
function catalogProductToCartItem(
  product: Product,
  modifiers: SelectedModifiers,
): CartItem {
  const groups: ModifierGroup[] = product.modifierGroups ?? [];

  const selectedMods: Array<{ name: string; price: number }> = [];
  let modifierPriceDelta = 0;

  for (const group of groups) {
    const selectedIds = modifiers[group.id] ?? [];
    for (const optId of selectedIds) {
      const opt = group.options.find((o) => o.id === optId);
      if (opt) {
        selectedMods.push({ name: opt.name, price: opt.priceDelta / 100 });
        modifierPriceDelta += opt.priceDelta / 100;
      }
    }
  }

  const cartKey = `${product.id}-${JSON.stringify(modifiers)}`;

  return {
    id: product.id,
    name: product.name,
    price: product.price / 100 + modifierPriceDelta,
    category: product.category ?? '',
    emoji: '📦',
    qty: 1,
    modifiers: selectedMods.length > 0 ? selectedMods : undefined,
    cartKey,
  };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SellScreen() {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [searchModalVisible, setSearchModalVisible] = useState(false);

  const filtered = PRODUCTS.filter(
    (p) =>
      (category === 'All' || p.category === category) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const addLocalProductToCart = (product: LocalProduct) => {
    const cartKey = product.id;
    setCart((prev) => {
      const existing = prev.find((i) => i.cartKey === cartKey);
      if (existing) {
        return prev.map((i) => i.cartKey === cartKey ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...product, qty: 1, cartKey }];
    });
  };

  const addCatalogProductToCart = (product: Product, modifiers: SelectedModifiers) => {
    const item = catalogProductToCartItem(product, modifiers);
    setCart((prev) => {
      const existing = prev.find((i) => i.cartKey === item.cartKey);
      if (existing) {
        return prev.map((i) => i.cartKey === item.cartKey ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, item];
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
    router.push({
      pathname: '/payment',
      params: {
        items: JSON.stringify(
          cart.map((i) => ({
            id: i.cartKey,
            name: i.name,
            price: i.price,
            qty: i.qty,
            modifiers: i.modifiers ?? [],
          })),
        ),
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2),
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* Product Panel */}
        <View style={styles.productPanel}>
          {/* Search row with catalogue search icon */}
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color="#6b7280" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Filter products…"
              placeholderTextColor="#6b7280"
              value={search}
              onChangeText={setSearch}
            />
            {/* Catalogue / barcode search button */}
            <TouchableOpacity
              onPress={() => setSearchModalVisible(true)}
              style={styles.catalogSearchBtn}
              accessibilityLabel="Open product catalogue search"
            >
              <Ionicons name="barcode-outline" size={20} color="#818cf8" />
            </TouchableOpacity>
          </View>

          {/* Categories */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                onPress={() => setCategory(cat)}
                style={[styles.catBtn, category === cat && styles.catBtnActive]}
              >
                <Text style={[styles.catBtnText, category === cat && styles.catBtnTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Product Grid */}
          <ScrollView style={styles.productScroll}>
            <View style={styles.productGrid}>
              {filtered.map((product) => {
                const inCart = cart.find((i) => i.id === product.id);
                return (
                  <TouchableOpacity
                    key={product.id}
                    style={[styles.productCard, inCart && styles.productCardActive]}
                    onPress={() => addLocalProductToCart(product)}
                  >
                    <Text style={styles.productEmoji}>{product.emoji}</Text>
                    <Text style={styles.productName}>{product.name}</Text>
                    <Text style={styles.productPrice}>${product.price.toFixed(2)}</Text>
                    {inCart && (
                      <View style={styles.qtyBadge}>
                        <Text style={styles.qtyBadgeText}>{inCart.qty}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* Cart Panel */}
        <View style={styles.cartPanel}>
          <Text style={styles.cartTitle}>Order</Text>
          {cart.length === 0 ? (
            <View style={styles.cartEmpty}>
              <Ionicons name="cart-outline" size={40} color="#4b5563" />
              <Text style={styles.cartEmptyText}>Add items to order</Text>
            </View>
          ) : (
            <ScrollView style={styles.cartScroll}>
              {cart.map((item) => (
                <View key={item.cartKey} style={styles.cartItem}>
                  <View style={styles.cartItemInfo}>
                    <Text style={styles.cartItemName}>{item.name}</Text>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <Text style={styles.cartItemMods}>
                        {item.modifiers.map((m) => m.name).join(', ')}
                      </Text>
                    )}
                    <Text style={styles.cartItemPrice}>
                      ${(item.price * item.qty).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.qtyControl}>
                    <TouchableOpacity
                      onPress={() => removeFromCart(item.cartKey)}
                      style={styles.qtyBtn}
                    >
                      <Ionicons name="remove" size={14} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{item.qty}</Text>
                    <TouchableOpacity
                      onPress={() => addLocalProductToCart(item)}
                      style={styles.qtyBtn}
                    >
                      <Ionicons name="add" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Totals */}
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>${subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax (10%)</Text>
              <Text style={styles.totalValue}>${tax.toFixed(2)}</Text>
            </View>
            <View style={[styles.totalRow, styles.totalFinal]}>
              <Text style={styles.totalFinalLabel}>Total</Text>
              <Text style={styles.totalFinalValue}>${total.toFixed(2)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.chargeBtn, cart.length === 0 && styles.chargeBtnDisabled]}
              onPress={handleCharge}
              disabled={cart.length === 0}
            >
              <Ionicons name="card" size={18} color="#fff" />
              <Text style={styles.chargeBtnText}>Charge ${total.toFixed(2)}</Text>
            </TouchableOpacity>
            {cart.length > 0 && (
              <TouchableOpacity style={styles.clearBtn} onPress={() => setCart([])}>
                <Text style={styles.clearBtnText}>Clear order</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Catalogue Product Search modal */}
      <ProductSearch
        visible={searchModalVisible}
        onClose={() => setSearchModalVisible(false)}
        onSelect={(product, modifiers) => {
          addCatalogProductToCart(product, modifiers);
          setSearchModalVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e2e' },
  inner: { flex: 1, flexDirection: 'row' },
  productPanel: { flex: 1.4, borderRightWidth: 1, borderRightColor: '#2a2a3a', padding: 12 },
  cartPanel: { flex: 1, padding: 12, backgroundColor: '#16161f' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a3a',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 10 },
  catalogSearchBtn: { padding: 6, marginLeft: 4 },
  catScroll: { marginBottom: 12, flexGrow: 0 },
  catBtn: { marginRight: 8, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#2a2a3a' },
  catBtnActive: { backgroundColor: '#818cf8' },
  catBtnText: { color: '#9ca3af', fontSize: 13, fontWeight: '500' },
  catBtnTextActive: { color: '#fff' },
  productScroll: { flex: 1 },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  productCard: { width: '30%', backgroundColor: '#2a2a3a', borderRadius: 12, padding: 12, alignItems: 'center', position: 'relative' },
  productCardActive: { backgroundColor: '#3730a3', borderWidth: 1, borderColor: '#818cf8' },
  productEmoji: { fontSize: 28, marginBottom: 6 },
  productName: { color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  productPrice: { color: '#a5b4fc', fontSize: 13, fontWeight: 'bold' },
  qtyBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: '#818cf8', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  qtyBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  cartTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  cartEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cartEmptyText: { color: '#4b5563', marginTop: 8, fontSize: 14 },
  cartScroll: { flex: 1 },
  cartItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, backgroundColor: '#2a2a3a', borderRadius: 10, padding: 10 },
  cartItemInfo: { flex: 1 },
  cartItemName: { color: '#fff', fontSize: 13, fontWeight: '500' },
  cartItemMods: { color: '#6b7280', fontSize: 11, marginTop: 1 },
  cartItemPrice: { color: '#a5b4fc', fontSize: 12, marginTop: 2 },
  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { backgroundColor: '#3730a3', borderRadius: 6, width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  qtyText: { color: '#fff', fontWeight: 'bold', minWidth: 20, textAlign: 'center' },
  totals: { borderTopWidth: 1, borderTopColor: '#2a2a3a', paddingTop: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  totalLabel: { color: '#9ca3af', fontSize: 13 },
  totalValue: { color: '#d1d5db', fontSize: 13 },
  totalFinal: { borderTopWidth: 1, borderTopColor: '#2a2a3a', paddingTop: 8, marginTop: 4, marginBottom: 12 },
  totalFinalLabel: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  totalFinalValue: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  chargeBtn: { backgroundColor: '#818cf8', borderRadius: 12, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  chargeBtnDisabled: { opacity: 0.4 },
  chargeBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  clearBtn: { marginTop: 8, alignItems: 'center', padding: 8 },
  clearBtnText: { color: '#6b7280', fontSize: 12 },
});
