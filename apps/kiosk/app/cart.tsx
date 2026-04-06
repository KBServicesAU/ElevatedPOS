import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKioskStore } from '../store/kiosk';

const TAX_RATE = 0.10;

export default function CartScreen() {
  const router = useRouter();
  const { cartItems, updateCartQty, removeFromCart, dineIn, setDineIn, customerName, setCustomerName } = useKioskStore();
  const [nameInput, setNameInput] = useState(customerName);

  const subtotal = cartItems.reduce((sum, item) => {
    const modifierTotal = item.modifiers.reduce((ms, m) => ms + m.priceAdjustment, 0);
    return sum + (item.price + modifierTotal) * item.qty;
  }, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  function handleQty(id: string, delta: number) {
    const item = cartItems.find((i) => i.id === id);
    if (!item) return;
    const newQty = item.qty + delta;
    if (newQty <= 0) {
      removeFromCart(id);
    } else {
      updateCartQty(id, newQty);
    }
  }

  function handleCheckout() {
    setCustomerName(nameInput.trim());
    router.push('/payment');
  }

  if (cartItems.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🛒</Text>
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <TouchableOpacity style={styles.browseButton} onPress={() => router.back()}>
            <Text style={styles.browseButtonText}>← Browse Menu</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Dine-in / Takeaway toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, dineIn && styles.toggleBtnActive]}
          onPress={() => setDineIn(true)}
        >
          <Text style={[styles.toggleText, dineIn && styles.toggleTextActive]}>🍽 Dine In</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, !dineIn && styles.toggleBtnActive]}
          onPress={() => setDineIn(false)}
        >
          <Text style={[styles.toggleText, !dineIn && styles.toggleTextActive]}>🥡 Takeaway</Text>
        </TouchableOpacity>
      </View>

      {/* Name / buzzer */}
      <View style={styles.nameRow}>
        <Text style={styles.nameLabel}>Name / Table / Buzzer</Text>
        <TextInput
          style={styles.nameInput}
          placeholder="Enter your name or buzzer number"
          placeholderTextColor="#555"
          value={nameInput}
          onChangeText={setNameInput}
          returnKeyType="done"
        />
      </View>

      {/* Cart items */}
      <FlatList
        data={cartItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.cartItem}>
            {item.imageUrl ? (
              <Image
                source={{ uri: item.imageUrl }}
                style={styles.cartItemImage}
                resizeMode="cover"
              />
            ) : null}
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name}</Text>
              {item.modifiers.length > 0 && (
                <Text style={styles.itemModifiers}>
                  {item.modifiers.map((m) => m.optionName).join(', ')}
                </Text>
              )}
              <Text style={styles.itemPrice}>
                ${((item.price + item.modifiers.reduce((s, m) => s + m.priceAdjustment, 0)) * item.qty).toFixed(2)}
              </Text>
            </View>
            <View style={styles.qtyRow}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => handleQty(item.id, -1)}>
                <Text style={styles.qtyBtnText}>{item.qty === 1 ? '🗑' : '−'}</Text>
              </TouchableOpacity>
              <Text style={styles.qtyNum}>{item.qty}</Text>
              <TouchableOpacity style={[styles.qtyBtn, styles.qtyBtnAdd]} onPress={() => handleQty(item.id, 1)}>
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListFooterComponent={
          <TouchableOpacity style={styles.addMoreBtn} onPress={() => router.back()}>
            <Text style={styles.addMoreText}>+ Add More Items</Text>
          </TouchableOpacity>
        }
      />

      {/* Summary + checkout */}
      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>${subtotal.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>GST (10%)</Text>
          <Text style={styles.summaryValue}>${tax.toFixed(2)}</Text>
        </View>
        <View style={[styles.summaryRow, styles.summaryTotal]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
        </View>
        <TouchableOpacity style={styles.checkoutButton} onPress={handleCheckout}>
          <Text style={styles.checkoutText}>Proceed to Payment →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 24 },
  browseButton: { backgroundColor: '#f97316', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  browseButtonText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  toggleRow: { flexDirection: 'row', margin: 16, gap: 12 },
  toggleBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#1a1a1a', alignItems: 'center', borderWidth: 1.5, borderColor: '#333' },
  toggleBtnActive: { backgroundColor: 'rgba(249,115,22,0.15)', borderColor: '#f97316' },
  toggleText: { fontSize: 16, fontWeight: '600', color: '#666' },
  toggleTextActive: { color: '#f97316' },
  nameRow: { paddingHorizontal: 16, marginBottom: 8 },
  nameLabel: { fontSize: 13, color: '#666', marginBottom: 6 },
  nameInput: { backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#fff', borderWidth: 1, borderColor: '#333' },
  list: { paddingHorizontal: 16, paddingBottom: 8 },
  cartItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e1e1e', gap: 12 },
  cartItemImage: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#111' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 2 },
  itemModifiers: { fontSize: 12, color: '#666', marginBottom: 2 },
  itemPrice: { fontSize: 14, color: '#888' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  qtyBtnAdd: { backgroundColor: '#f97316' },
  qtyBtnText: { fontSize: 18, color: '#fff', fontWeight: '700' },
  qtyNum: { fontSize: 18, fontWeight: '700', color: '#fff', minWidth: 24, textAlign: 'center' },
  addMoreBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#333', alignItems: 'center', borderStyle: 'dashed' },
  addMoreText: { fontSize: 15, color: '#888', fontWeight: '600' },
  summary: { padding: 16, backgroundColor: '#111', borderTopWidth: 1, borderTopColor: '#222' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { fontSize: 15, color: '#888' },
  summaryValue: { fontSize: 15, color: '#ccc' },
  summaryTotal: { borderTopWidth: 1, borderTopColor: '#2a2a2a', paddingTop: 12, marginTop: 4, marginBottom: 16 },
  totalLabel: { fontSize: 20, fontWeight: '800', color: '#fff' },
  totalValue: { fontSize: 24, fontWeight: '900', color: '#f97316' },
  checkoutButton: { backgroundColor: '#f97316', borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  checkoutText: { fontSize: 19, fontWeight: '800', color: '#fff' },
});
