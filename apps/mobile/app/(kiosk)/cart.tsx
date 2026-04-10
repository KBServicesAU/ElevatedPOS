import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKioskStore, type CartItem } from '../../store/kiosk';
import { useCatalogStore, type CatalogProduct } from '../../store/catalog';

const UPSELL_LIMIT = 6;

export default function CartScreen() {
  const router = useRouter();
  const {
    cartItems,
    addToCart,
    updateCartQty,
    removeFromCart,
    dineIn,
    setDineIn,
    customerName,
    setCustomerName,
  } = useKioskStore();
  const {
    products,
    upsellProductIds,
    upsellHydrated,
    hydrateUpsell,
    fetchAll,
  } = useCatalogStore();
  const [nameInput, setNameInput] = useState(customerName);
  const [upsellOpen, setUpsellOpen] = useState(false);

  // Make sure upsell list + product details are loaded.
  useEffect(() => {
    if (!upsellHydrated) hydrateUpsell();
    if (products.length === 0) fetchAll();
  }, [upsellHydrated, products.length, hydrateUpsell, fetchAll]);

  const total = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const gstIncluded = total / 11;

  // Suggested products = configured upsells that aren't already in the cart.
  const upsellSuggestions: CatalogProduct[] = useMemo(() => {
    if (upsellProductIds.size === 0) return [];
    const inCart = new Set(cartItems.map((c) => c.id));
    return products
      .filter((p) => upsellProductIds.has(p.id) && !inCart.has(p.id) && p.isActive !== false)
      .slice(0, UPSELL_LIMIT);
  }, [products, upsellProductIds, cartItems]);

  function handleQty(cartKey: string, delta: number) {
    const item = cartItems.find((i) => i.cartKey === cartKey);
    if (!item) return;
    const newQty = item.qty + delta;
    if (newQty <= 0) {
      removeFromCart(cartKey);
    } else {
      updateCartQty(cartKey, newQty);
    }
  }

  function handleCheckout() {
    setCustomerName(nameInput.trim());
    if (upsellSuggestions.length > 0) {
      setUpsellOpen(true);
      return;
    }
    router.push('/(kiosk)/payment');
  }

  function handleAddUpsell(p: CatalogProduct) {
    const priceNumber = parseFloat(p.basePrice) || 0;
    const item: CartItem = {
      id: p.id,
      cartKey: `${p.id}::upsell::${Date.now()}`,
      name: p.name,
      price: priceNumber,
      qty: 1,
      modifiers: [],
    };
    addToCart(item);
  }

  function handleSkipUpsell() {
    setUpsellOpen(false);
    router.push('/(kiosk)/payment');
  }

  function handleConfirmUpsell() {
    setUpsellOpen(false);
    router.push('/(kiosk)/payment');
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

      <FlatList
        data={cartItems}
        keyExtractor={(item) => item.cartKey}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.cartItem}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemPrice}>${(item.price * item.qty).toFixed(2)}</Text>
            </View>
            <View style={styles.qtyRow}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => handleQty(item.cartKey, -1)}>
                <Text style={styles.qtyBtnText}>{item.qty === 1 ? '🗑' : '−'}</Text>
              </TouchableOpacity>
              <Text style={styles.qtyNum}>{item.qty}</Text>
              <TouchableOpacity style={[styles.qtyBtn, styles.qtyBtnAdd]} onPress={() => handleQty(item.cartKey, 1)}>
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

      <View style={styles.summary}>
        <View style={[styles.summaryRow, styles.summaryTotal]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Incl. GST</Text>
          <Text style={styles.summaryValue}>${gstIncluded.toFixed(2)}</Text>
        </View>
        <TouchableOpacity style={styles.checkoutButton} onPress={handleCheckout}>
          <Text style={styles.checkoutText}>Proceed to Payment →</Text>
        </TouchableOpacity>
      </View>

      {/* ── Upsell Modal ── */}
      <Modal
        visible={upsellOpen}
        animationType="slide"
        transparent
        onRequestClose={handleSkipUpsell}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalEmoji}>✨</Text>
            <Text style={styles.modalTitle}>Would you like anything else?</Text>
            <Text style={styles.modalSubtitle}>Tap to add — or skip and pay now.</Text>

            <FlatList
              data={upsellSuggestions}
              keyExtractor={(p) => p.id}
              numColumns={2}
              columnWrapperStyle={{ gap: 12 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12, gap: 12 }}
              extraData={cartItems}
              renderItem={({ item }) => {
                const inCart = cartItems.some((c) => c.id === item.id);
                return (
                  <TouchableOpacity
                    style={[styles.upsellCard, inCart && styles.upsellCardAdded]}
                    onPress={() => handleAddUpsell(item)}
                    activeOpacity={0.85}
                    disabled={inCart}
                  >
                    <View style={styles.upsellThumb}>
                      <Text style={styles.upsellThumbText}>
                        {item.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.upsellName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.upsellPrice}>${item.basePrice}</Text>
                    <View style={[styles.upsellAddPill, inCart && styles.upsellAddedPill]}>
                      <Text style={styles.upsellAddText}>
                        {inCart ? 'Added ✓' : '+ Add'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.skipBtn} onPress={handleSkipUpsell}>
                <Text style={styles.skipBtnText}>No thanks</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmUpsell}>
                <Text style={styles.confirmBtnText}>Continue to Payment →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  cartItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 2 },
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

  // ── Upsell Modal ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: '90%',
  },
  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#333',
    alignSelf: 'center',
    marginBottom: 18,
  },
  modalEmoji: { fontSize: 36, textAlign: 'center', marginBottom: 6 },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 24,
  },
  upsellCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
  },
  upsellCardAdded: {
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  upsellThumb: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  upsellThumbText: { color: '#fff', fontSize: 26, fontWeight: '900' },
  upsellName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    minHeight: 36,
  },
  upsellPrice: {
    color: '#f97316',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
  },
  upsellAddPill: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#f97316',
  },
  upsellAddedPill: {
    backgroundColor: '#22c55e',
  },
  upsellAddText: { color: '#fff', fontSize: 12, fontWeight: '900' },

  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  skipBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#1a1a1a',
    borderWidth: 1.5,
    borderColor: '#333',
    alignItems: 'center',
  },
  skipBtnText: { color: '#888', fontSize: 15, fontWeight: '800' },
  confirmBtn: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#f97316',
    alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
