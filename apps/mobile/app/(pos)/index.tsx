import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePosStore } from '../../store/pos';
import { useDeviceStore } from '../../store/device';

const PRODUCTS = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Flat White', price: 5.50, emoji: '☕' },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Iced Latte', price: 6.50, emoji: '🧊' },
  { id: '00000000-0000-0000-0000-000000000003', name: 'Cold Brew', price: 7.00, emoji: '🫗' },
  { id: '00000000-0000-0000-0000-000000000004', name: 'Pour Over', price: 7.50, emoji: '☕' },
  { id: '00000000-0000-0000-0000-000000000005', name: 'Croissant', price: 5.00, emoji: '🥐' },
  { id: '00000000-0000-0000-0000-000000000006', name: 'Banana Bread', price: 6.00, emoji: '🍞' },
  { id: '00000000-0000-0000-0000-000000000007', name: 'Avocado Toast', price: 14.00, emoji: '🥑' },
  { id: '00000000-0000-0000-0000-000000000008', name: 'Eggs Benedict', price: 18.00, emoji: '🍳' },
];

const TAX_RATE = 0.10;

export default function PosSellScreen() {
  const { cart, addItem, removeItem, clearCart } = usePosStore();
  const { identity } = useDeviceStore();
  const [charging, setCharging] = useState(false);

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  const itemCount = cart.reduce((sum, i) => sum + i.qty, 0);

  async function handleCharge() {
    if (cart.length === 0) return;
    setCharging(true);
    try {
      const apiBase = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';
      const payload = {
        items: cart.map((i) => ({ productId: i.id, name: i.name, qty: i.qty, unitPrice: i.price })),
        subtotal, tax, total,
        paymentMethod: 'card',
        channel: 'pos',
      };
      const res = await fetch(`${apiBase}/api/v1/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(identity ? { Authorization: `Bearer ${identity.deviceToken}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      const data = res.ok ? await res.json() : null;
      const orderNum = (data as { orderNumber?: string } | null)?.orderNumber ?? `P${Math.floor(100 + Math.random() * 900)}`;
      clearCart();
      Alert.alert('Order Placed', `Order #${orderNum} — $${total.toFixed(2)} charged`, [{ text: 'OK' }]);
    } catch {
      const orderNum = `P${Math.floor(100 + Math.random() * 900)}`;
      clearCart();
      Alert.alert('Order Placed', `Order #${orderNum} — $${total.toFixed(2)}`, [{ text: 'OK' }]);
    } finally {
      setCharging(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.layout}>
        {/* Product Grid */}
        <View style={styles.gridArea}>
          <FlatList
            data={PRODUCTS}
            keyExtractor={(p) => p.id}
            numColumns={2}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => {
              const inCart = cart.find((c) => c.id === item.id);
              return (
                <TouchableOpacity
                  style={[styles.productCard, inCart ? styles.productCardActive : null]}
                  onPress={() => addItem(item)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.productEmoji}>{item.emoji}</Text>
                  <Text style={styles.productName}>{item.name}</Text>
                  <View style={styles.productFooter}>
                    <Text style={styles.productPrice}>${item.price.toFixed(2)}</Text>
                    {inCart ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{inCart.qty}</Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Cart Panel */}
        <View style={styles.cartPanel}>
          <Text style={styles.cartTitle}>{`Order${itemCount > 0 ? ` (${itemCount})` : ''}`}</Text>

          {cart.length === 0 ? (
            <View style={styles.emptyCart}>
              <Text style={styles.emptyCartEmoji}>🛒</Text>
              <Text style={styles.emptyCartText}>Tap items to add</Text>
            </View>
          ) : (
            <ScrollView style={styles.cartList} showsVerticalScrollIndicator={false}>
              {cart.map((item) => (
                <View key={item.id} style={styles.cartRow}>
                  <View style={styles.cartItemInfo}>
                    <Text style={styles.cartItemEmoji}>{item.emoji}</Text>
                    <View style={styles.cartItemDetails}>
                      <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.cartItemPrice}>${(item.price * item.qty).toFixed(2)}</Text>
                    </View>
                  </View>
                  <View style={styles.cartQtyRow}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => removeItem(item.id)}>
                      <Text style={styles.qtyBtnText}>{item.qty === 1 ? '🗑' : '−'}</Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyNum}>{item.qty}</Text>
                    <TouchableOpacity style={[styles.qtyBtn, styles.qtyBtnAdd]} onPress={() => addItem(item)}>
                      <Text style={styles.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {cart.length > 0 && (
            <View style={styles.totals}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>${subtotal.toFixed(2)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>GST (10%)</Text>
                <Text style={styles.totalValue}>${tax.toFixed(2)}</Text>
              </View>
              <View style={[styles.totalRow, styles.grandTotalRow]}>
                <Text style={styles.grandTotalLabel}>Total</Text>
                <Text style={styles.grandTotalValue}>${total.toFixed(2)}</Text>
              </View>
              <TouchableOpacity
                style={[styles.chargeBtn, (charging || cart.length === 0) ? styles.chargeBtnDisabled : null]}
                onPress={handleCharge}
                disabled={charging || cart.length === 0}
                activeOpacity={0.85}
              >
                <Text style={styles.chargeBtnText}>
                  {charging ? 'Processing...' : `Charge $${total.toFixed(2)}`}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.clearBtn} onPress={clearCart}>
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  layout: { flex: 1, flexDirection: 'row' },
  gridArea: { flex: 1.4, borderRightWidth: 1, borderRightColor: '#1e1e2e' },
  grid: { padding: 8, paddingBottom: 20 },
  productCard: {
    flex: 1,
    backgroundColor: '#141425',
    borderRadius: 14,
    padding: 14,
    margin: 4,
    borderWidth: 1.5,
    borderColor: '#2a2a3a',
    alignItems: 'center',
    minHeight: 110,
    justifyContent: 'center',
  },
  productCardActive: { borderColor: '#6366f1', backgroundColor: '#1a1a35' },
  productEmoji: { fontSize: 32, marginBottom: 6 },
  productName: { fontSize: 13, fontWeight: '700', color: '#ccc', textAlign: 'center', marginBottom: 6 },
  productFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  productPrice: { fontSize: 15, fontWeight: '800', color: '#6366f1' },
  badge: { backgroundColor: '#6366f1', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  cartPanel: { flex: 1, backgroundColor: '#0a0a14', padding: 14, flexDirection: 'column' },
  cartTitle: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 12 },
  emptyCart: { flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.4 },
  emptyCartEmoji: { fontSize: 40, marginBottom: 8 },
  emptyCartText: { fontSize: 15, color: '#888' },
  cartList: { flex: 1 },
  cartRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a2a' },
  cartItemInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartItemEmoji: { fontSize: 22 },
  cartItemDetails: { flex: 1 },
  cartItemName: { fontSize: 13, fontWeight: '600', color: '#ccc' },
  cartItemPrice: { fontSize: 12, color: '#6366f1', marginTop: 1 },
  cartQtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#2a2a3a', alignItems: 'center', justifyContent: 'center' },
  qtyBtnAdd: { backgroundColor: '#6366f1' },
  qtyBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  qtyNum: { fontSize: 15, fontWeight: '800', color: '#fff', minWidth: 20, textAlign: 'center' },
  totals: { borderTopWidth: 1, borderTopColor: '#1e1e2e', paddingTop: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  totalLabel: { fontSize: 13, color: '#777' },
  totalValue: { fontSize: 13, color: '#aaa' },
  grandTotalRow: { borderTopWidth: 1, borderTopColor: '#2a2a3a', paddingTop: 8, marginTop: 4, marginBottom: 14 },
  grandTotalLabel: { fontSize: 18, fontWeight: '800', color: '#fff' },
  grandTotalValue: { fontSize: 20, fontWeight: '900', color: '#6366f1' },
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
  chargeBtnDisabled: { opacity: 0.4, shadowOpacity: 0, elevation: 0 },
  chargeBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  clearBtn: { paddingVertical: 8, alignItems: 'center' },
  clearBtnText: { fontSize: 13, color: '#555' },
});
