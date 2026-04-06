import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput,
  SafeAreaView, Modal, Switch, Image, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ProductSearch from '../../components/ProductSearch';
import type { Product, ModifierGroup } from '../../components/ProductSearch';
import type { SelectedModifiers } from '../../components/ModifierModal';
import { useAuthStore } from '../../store/auth';
import { useProductsStore } from '../../store/products';
import type { DiscountType, Discount } from '../../store/cart';
import { computeItemDiscount } from '../../store/cart';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocalProduct {
  id: string;
  name: string;
  price: number;
  wholesalePrice?: number;
  costPrice?: number;
  category: string;
  emoji: string;
  imageUrl?: string;
  image?: string;
}

interface CartItem extends LocalProduct {
  qty: number;
  modifiers?: Array<{ name: string; price: number }>;
  /** Unique key when the same product has different modifier sets */
  cartKey: string;
  /** Original standard price preserved for mode switching */
  standardPrice: number;
  /** Item-level discount */
  discount?: Discount;
}

// ─── Product catalogue is now loaded from the API via useProductsStore ───────

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

  const finalPrice = product.price / 100 + modifierPriceDelta;

  return {
    id: product.id,
    name: product.name,
    price: finalPrice,
    standardPrice: finalPrice,
    category: product.category ?? '',
    emoji: '📦',
    qty: 1,
    modifiers: selectedMods.length > 0 ? selectedMods : undefined,
    cartKey,
  };
}

// ─── Category color helper ───────────────────────────────────────────────────

const CATEGORY_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#f97316', '#6366f1',
];

function categoryColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}

// ─── Table Management ────────────────────────────────────────────────────────

const TABLE_NUMBERS = Array.from({ length: 20 }, (_, i) => i + 1);

// ─── Wholesale price helper ──────────────────────────────────────────────────

function getWholesalePrice(product: LocalProduct): number {
  return product.wholesalePrice ?? product.costPrice ?? product.price;
}

// ─── Product image helper ────────────────────────────────────────────────────

function getProductImageUri(product: LocalProduct): string | undefined {
  return product.imageUrl ?? product.image;
}

// ─── Discount preset options for the item-level modal ────────────────────────

const ITEM_DISCOUNT_PRESETS = [
  { label: '10%', type: 'percentage' as DiscountType, value: 10 },
  { label: '20%', type: 'percentage' as DiscountType, value: 20 },
  { label: '50%', type: 'percentage' as DiscountType, value: 50 },
];

// ─── Screen ──────���────────────────────────────────────────────────────────────

export default function SellScreen() {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [tableModalVisible, setTableModalVisible] = useState(false);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [priceMode, setPriceMode] = useState<'standard' | 'wholesale'>('standard');

  // Auth store for role-based wholesale access
  const employee = useAuthStore((s) => s.employee);
  const canUseWholesale = employee?.role === 'admin' || employee?.role === 'manager';

  // Products store — live API data with offline fallback
  const storeProducts = useProductsStore((s) => s.products);
  const storeCategories = useProductsStore((s) => s.categories);
  const productsLoading = useProductsStore((s) => s.loading);
  const productsOffline = useProductsStore((s) => s.offline);
  const fetchProducts = useProductsStore((s) => s.fetchProducts);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // ── Discount state ──────────────────────────────────────────────────────────
  const [itemDiscountModalVisible, setItemDiscountModalVisible] = useState(false);
  const [itemDiscountIndex, setItemDiscountIndex] = useState<number | null>(null);
  const [customDiscountValue, setCustomDiscountValue] = useState('');
  const [customDiscountType, setCustomDiscountType] = useState<DiscountType>('percentage');

  const [orderDiscountModalVisible, setOrderDiscountModalVisible] = useState(false);
  const [orderDiscount, setOrderDiscount] = useState<Discount | null>(null);
  const [orderDiscountInputValue, setOrderDiscountInputValue] = useState('');
  const [orderDiscountInputType, setOrderDiscountInputType] = useState<DiscountType>('percentage');

  // ── Order note state ────────────────────────────────────────────────────────
  const [orderNote, setOrderNote] = useState('');
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteInput, setNoteInput] = useState('');

  const filtered = storeProducts.filter(
    (p) =>
      (category === 'All' || p.category === category) &&
      (p.name.toLowerCase().includes(search.toLowerCase()) ||
       (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))),
  );

  const addLocalProductToCart = (product: LocalProduct) => {
    const cartKey = product.id;
    const effectivePrice = priceMode === 'wholesale' ? getWholesalePrice(product) : product.price;
    setCart((prev) => {
      const existing = prev.find((i) => i.cartKey === cartKey);
      if (existing) {
        return prev.map((i) => i.cartKey === cartKey ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...product, price: effectivePrice, standardPrice: product.price, qty: 1, cartKey }];
    });
  };

  const addCatalogProductToCart = (product: Product, modifiers: SelectedModifiers) => {
    const item = catalogProductToCartItem(product, modifiers);
    const standardPrice = item.price;
    let effectivePrice = standardPrice;
    if (priceMode === 'wholesale') {
      const wsBase = product.wholesalePrice ?? product.costPrice ?? product.price;
      // wsBase is in cents, convert to dollars like standardPrice
      effectivePrice = wsBase / 100;
      // Re-add modifier price delta
      const modPriceDelta = standardPrice - product.price / 100;
      effectivePrice += modPriceDelta;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.cartKey === item.cartKey);
      if (existing) {
        return prev.map((i) => i.cartKey === item.cartKey ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...item, price: effectivePrice, standardPrice }];
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

  // ── Table management ──────────────────────────────────────────────────────
  const handleSelectTable = (table: number) => {
    setSelectedTable(table);
    setTableModalVisible(false);
  };

  const handleClearTable = () => {
    setSelectedTable(null);
    setTableModalVisible(false);
  };

  // ── Wholesale toggle ────────────────────────────────────────────────────
  const handlePriceModeToggle = (isWholesale: boolean) => {
    const newMode = isWholesale ? 'wholesale' : 'standard';
    setPriceMode(newMode);
    // Recalculate all existing cart items with the new price mode
    setCart((prev) =>
      prev.map((item) => {
        const newPrice = isWholesale
          ? getWholesalePrice(item)
          : item.standardPrice;
        return { ...item, price: newPrice };
      }),
    );
  };

  // ── Item discount handlers ─────────────────────────────────────────────────

  const handleItemLongPress = useCallback((index: number) => {
    setItemDiscountIndex(index);
    setCustomDiscountValue('');
    setCustomDiscountType('percentage');
    setItemDiscountModalVisible(true);
  }, []);

  const applyItemDiscount = useCallback((type: DiscountType, value: number) => {
    if (itemDiscountIndex === null) return;
    setCart((prev) => {
      const items = [...prev];
      if (itemDiscountIndex < 0 || itemDiscountIndex >= items.length) return prev;
      items[itemDiscountIndex] = { ...items[itemDiscountIndex], discount: { type, value } };
      return items;
    });
    setItemDiscountModalVisible(false);
  }, [itemDiscountIndex]);

  const removeItemDiscount = useCallback(() => {
    if (itemDiscountIndex === null) return;
    setCart((prev) => {
      const items = [...prev];
      if (itemDiscountIndex < 0 || itemDiscountIndex >= items.length) return prev;
      const { discount: _removed, ...rest } = items[itemDiscountIndex];
      items[itemDiscountIndex] = rest as CartItem;
      return items;
    });
    setItemDiscountModalVisible(false);
  }, [itemDiscountIndex]);

  const handleCustomItemDiscount = useCallback(() => {
    const num = parseFloat(customDiscountValue);
    if (isNaN(num) || num <= 0) {
      Alert.alert('Invalid', 'Please enter a valid discount amount.');
      return;
    }
    if (customDiscountType === 'percentage' && num > 100) {
      Alert.alert('Invalid', 'Percentage cannot exceed 100%.');
      return;
    }
    applyItemDiscount(customDiscountType, num);
  }, [customDiscountValue, customDiscountType, applyItemDiscount]);

  // ── Order discount handlers ────────────────────────────────────────────────

  const openOrderDiscountModal = useCallback(() => {
    setOrderDiscountInputValue('');
    setOrderDiscountInputType('percentage');
    setOrderDiscountModalVisible(true);
  }, []);

  const handleApplyOrderDiscount = useCallback(() => {
    const num = parseFloat(orderDiscountInputValue);
    if (isNaN(num) || num <= 0) {
      Alert.alert('Invalid', 'Please enter a valid discount amount.');
      return;
    }
    if (orderDiscountInputType === 'percentage' && num > 100) {
      Alert.alert('Invalid', 'Percentage cannot exceed 100%.');
      return;
    }
    setOrderDiscount({ type: orderDiscountInputType, value: num });
    setOrderDiscountModalVisible(false);
  }, [orderDiscountInputValue, orderDiscountInputType]);

  const removeOrderDiscount = useCallback(() => {
    setOrderDiscount(null);
  }, []);

  // ── Order note handlers ────────────────────────────────────────────────────

  const openNoteModal = useCallback(() => {
    setNoteInput(orderNote);
    setNoteModalVisible(true);
  }, [orderNote]);

  const saveNote = useCallback(() => {
    setOrderNote(noteInput.trim());
    setNoteModalVisible(false);
  }, [noteInput]);

  // ── Computed totals (with discounts) ───────────────────────────────────────

  const subtotalBeforeDiscounts = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const totalItemDiscounts = cart.reduce((sum, i) => sum + computeItemDiscount(i), 0);

  let orderDiscountAmount = 0;
  if (orderDiscount) {
    const afterItems = subtotalBeforeDiscounts - totalItemDiscounts;
    if (orderDiscount.type === 'percentage') {
      orderDiscountAmount = Math.min(afterItems, afterItems * (orderDiscount.value / 100));
    } else {
      orderDiscountAmount = Math.min(afterItems, orderDiscount.value);
    }
  }

  const subtotal = subtotalBeforeDiscounts - totalItemDiscounts - orderDiscountAmount;
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
            discount: i.discount ?? null,
          })),
        ),
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2),
        ...(selectedTable != null ? { tableNumber: String(selectedTable) } : {}),
        ...(orderDiscount ? { orderDiscount: JSON.stringify(orderDiscount) } : {}),
        ...(orderNote ? { orderNote } : {}),
        priceMode,
      },
    });
  };

  const handleClearCart = useCallback(() => {
    setCart([]);
    setSelectedTable(null);
    setOrderDiscount(null);
    setOrderNote('');
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* Product Panel */}
        <View style={styles.productPanel}>
          {/* Header bar: Table button + Wholesale toggle */}
          <View style={styles.headerBar}>
            {/* Table selector button */}
            <TouchableOpacity
              style={styles.tableBtn}
              onPress={() => setTableModalVisible(true)}
            >
              <Ionicons name="restaurant-outline" size={16} color="#818cf8" />
              <Text style={styles.tableBtnText}>
                {selectedTable != null ? `Table ${selectedTable}` : 'Table'}
              </Text>
              {selectedTable != null && (
                <View style={styles.tableBadge}>
                  <Text style={styles.tableBadgeText}>{selectedTable}</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Wholesale toggle (admin/manager only) */}
            {canUseWholesale && (
              <View style={styles.wholesaleToggle}>
                <Text style={[
                  styles.wholesaleLabel,
                  priceMode === 'wholesale' && styles.wholesaleLabelActive,
                ]}>
                  {priceMode === 'wholesale' ? 'Wholesale' : 'Standard'}
                </Text>
                <Switch
                  value={priceMode === 'wholesale'}
                  onValueChange={handlePriceModeToggle}
                  trackColor={{ false: '#3a3a4a', true: '#4338ca' }}
                  thumbColor={priceMode === 'wholesale' ? '#818cf8' : '#6b7280'}
                />
              </View>
            )}
          </View>

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

          {/* Offline indicator */}
          {productsOffline && (
            <View style={styles.offlineBanner}>
              <Ionicons name="cloud-offline-outline" size={14} color="#f59e0b" />
              <Text style={styles.offlineBannerText}>Offline Mode</Text>
            </View>
          )}

          {/* Categories */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
            {storeCategories.map((cat) => (
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
                const imgUri = getProductImageUri(product);
                const displayPrice = priceMode === 'wholesale'
                  ? getWholesalePrice(product)
                  : product.price;
                return (
                  <TouchableOpacity
                    key={product.id}
                    style={[styles.productCard, inCart && styles.productCardActive]}
                    onPress={() => addLocalProductToCart(product)}
                  >
                    {imgUri ? (
                      <Image
                        source={{ uri: imgUri }}
                        style={styles.productImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.productImagePlaceholder, { backgroundColor: `${categoryColor(product.category)}33` }]}>
                        <Text style={[styles.productImagePlaceholderText, { color: categoryColor(product.category) }]}>
                          {product.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.productName}>{product.name}</Text>
                    <Text style={styles.productPrice}>${displayPrice.toFixed(2)}</Text>
                    {priceMode === 'wholesale' && product.price !== displayPrice && (
                      <Text style={styles.productOriginalPrice}>${product.price.toFixed(2)}</Text>
                    )}
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
          <View style={styles.cartHeader}>
            <View style={styles.cartHeaderLeft}>
              <Text style={styles.cartTitle}>Order</Text>
              {selectedTable != null && (
                <View style={styles.cartTableBadge}>
                  <Ionicons name="restaurant-outline" size={12} color="#818cf8" />
                  <Text style={styles.cartTableBadgeText}>Table {selectedTable}</Text>
                </View>
              )}
            </View>
            {/* Add Note button */}
            <TouchableOpacity style={styles.noteBtn} onPress={openNoteModal}>
              <Ionicons
                name={orderNote ? 'document-text' : 'document-text-outline'}
                size={16}
                color={orderNote ? '#818cf8' : '#6b7280'}
              />
              <Text style={[styles.noteBtnText, orderNote ? styles.noteBtnTextActive : null]}>
                {orderNote ? 'Note' : 'Add Note'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Order note preview */}
          {orderNote ? (
            <View style={styles.notePreview}>
              <Ionicons name="chatbubble-outline" size={12} color="#818cf8" />
              <Text style={styles.notePreviewText} numberOfLines={1}>{orderNote}</Text>
              <TouchableOpacity onPress={() => setOrderNote('')}>
                <Ionicons name="close-circle" size={14} color="#6b7280" />
              </TouchableOpacity>
            </View>
          ) : null}

          {cart.length === 0 ? (
            <View style={styles.cartEmpty}>
              <Ionicons name="cart-outline" size={40} color="#4b5563" />
              <Text style={styles.cartEmptyText}>Add items to order</Text>
            </View>
          ) : (
            <ScrollView style={styles.cartScroll}>
              {cart.map((item, index) => {
                const itemDisc = computeItemDiscount(item);
                return (
                  <TouchableOpacity
                    key={item.cartKey}
                    style={styles.cartItem}
                    onLongPress={() => handleItemLongPress(index)}
                    activeOpacity={0.85}
                    delayLongPress={400}
                  >
                    <View style={styles.cartItemInfo}>
                      <Text style={styles.cartItemName}>{item.name}</Text>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <Text style={styles.cartItemMods}>
                          {item.modifiers.map((m) => m.name).join(', ')}
                        </Text>
                      )}
                      {item.discount && (
                        <Text style={styles.cartItemDiscountLabel}>
                          {item.discount.type === 'percentage'
                            ? `-${item.discount.value}%`
                            : `-$${item.discount.value.toFixed(2)}`}
                          {' '}(-${itemDisc.toFixed(2)})
                        </Text>
                      )}
                      <Text style={styles.cartItemPrice}>
                        ${((item.price * item.qty) - itemDisc).toFixed(2)}
                        {itemDisc > 0 && (
                          <Text style={styles.cartItemOriginalPrice}>
                            {' '}${(item.price * item.qty).toFixed(2)}
                          </Text>
                        )}
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
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Totals */}
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>${subtotalBeforeDiscounts.toFixed(2)}</Text>
            </View>

            {/* Item discount total */}
            {totalItemDiscounts > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.discountLabel}>Item Discounts</Text>
                <Text style={styles.discountValue}>-${totalItemDiscounts.toFixed(2)}</Text>
              </View>
            )}

            {/* Order discount */}
            {orderDiscount ? (
              <View style={styles.totalRow}>
                <View style={styles.orderDiscountRow}>
                  <Text style={styles.discountLabel}>
                    Order Discount
                    {orderDiscount.type === 'percentage'
                      ? ` (${orderDiscount.value}%)`
                      : ` ($${orderDiscount.value.toFixed(2)})`}
                  </Text>
                  <TouchableOpacity onPress={removeOrderDiscount} style={styles.removeDiscountBtn}>
                    <Ionicons name="close-circle" size={14} color="#f87171" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.discountValue}>-${orderDiscountAmount.toFixed(2)}</Text>
              </View>
            ) : cart.length > 0 ? (
              <TouchableOpacity style={styles.addOrderDiscountBtn} onPress={openOrderDiscountModal}>
                <Ionicons name="pricetag-outline" size={14} color="#818cf8" />
                <Text style={styles.addOrderDiscountText}>Add Order Discount</Text>
              </TouchableOpacity>
            ) : null}

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
              <TouchableOpacity style={styles.clearBtn} onPress={handleClearCart}>
                <Text style={styles.clearBtnText}>Clear order</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Table Selection Modal */}
      <Modal
        visible={tableModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTableModalVisible(false)}
      >
        <View style={styles.tableModalOverlay}>
          <View style={styles.tableModalContent}>
            <View style={styles.tableModalHeader}>
              <Text style={styles.tableModalTitle}>Select Table</Text>
              <TouchableOpacity onPress={() => setTableModalVisible(false)}>
                <Ionicons name="close" size={22} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.tableModalScroll}>
              <View style={styles.tableGrid}>
                {TABLE_NUMBERS.map((num) => (
                  <TouchableOpacity
                    key={num}
                    style={[
                      styles.tableGridItem,
                      selectedTable === num && styles.tableGridItemActive,
                    ]}
                    onPress={() => handleSelectTable(num)}
                  >
                    <Text style={[
                      styles.tableGridItemText,
                      selectedTable === num && styles.tableGridItemTextActive,
                    ]}>
                      {num}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            {selectedTable != null && (
              <TouchableOpacity style={styles.clearTableBtn} onPress={handleClearTable}>
                <Ionicons name="close-circle-outline" size={16} color="#ef4444" />
                <Text style={styles.clearTableBtnText}>Clear Table</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Catalogue Product Search modal */}
      <ProductSearch
        visible={searchModalVisible}
        onClose={() => setSearchModalVisible(false)}
        onSelect={(product, modifiers) => {
          addCatalogProductToCart(product, modifiers);
          setSearchModalVisible(false);
        }}
      />

      {/* ── Item Discount Modal ───────────────────────────────────────── */}
      <Modal
        visible={itemDiscountModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setItemDiscountModalVisible(false)}
      >
        <View style={styles.discountModalOverlay}>
          <View style={styles.discountModalContent}>
            <Text style={styles.discountModalTitle}>
              Discount: {itemDiscountIndex !== null && cart[itemDiscountIndex]
                ? cart[itemDiscountIndex].name
                : ''}
            </Text>

            {/* Preset buttons */}
            <View style={styles.discountPresets}>
              {ITEM_DISCOUNT_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.label}
                  style={styles.discountPresetBtn}
                  onPress={() => applyItemDiscount(preset.type, preset.value)}
                >
                  <Text style={styles.discountPresetText}>{preset.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom discount */}
            <Text style={styles.discountModalSubtitle}>Custom Discount</Text>
            <View style={styles.customDiscountRow}>
              <TouchableOpacity
                style={[
                  styles.discountTypeBtn,
                  customDiscountType === 'percentage' && styles.discountTypeBtnActive,
                ]}
                onPress={() => setCustomDiscountType('percentage')}
              >
                <Text
                  style={[
                    styles.discountTypeText,
                    customDiscountType === 'percentage' && styles.discountTypeTextActive,
                  ]}
                >
                  %
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.discountTypeBtn,
                  customDiscountType === 'fixed' && styles.discountTypeBtnActive,
                ]}
                onPress={() => setCustomDiscountType('fixed')}
              >
                <Text
                  style={[
                    styles.discountTypeText,
                    customDiscountType === 'fixed' && styles.discountTypeTextActive,
                  ]}
                >
                  $
                </Text>
              </TouchableOpacity>
              <TextInput
                style={styles.customDiscountInput}
                placeholder={customDiscountType === 'percentage' ? 'e.g. 15' : 'e.g. 2.50'}
                placeholderTextColor="#6b7280"
                keyboardType="numeric"
                value={customDiscountValue}
                onChangeText={setCustomDiscountValue}
              />
              <TouchableOpacity style={styles.customDiscountApply} onPress={handleCustomItemDiscount}>
                <Text style={styles.customDiscountApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>

            {/* Remove / Cancel row */}
            <View style={styles.discountModalActions}>
              {itemDiscountIndex !== null && cart[itemDiscountIndex]?.discount && (
                <TouchableOpacity style={styles.removeDiscountAction} onPress={removeItemDiscount}>
                  <Text style={styles.removeDiscountActionText}>Remove Discount</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.discountModalCancelBtn}
                onPress={() => setItemDiscountModalVisible(false)}
              >
                <Text style={styles.discountModalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Order Discount Modal ──────────────────────────────────────── */}
      <Modal
        visible={orderDiscountModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOrderDiscountModalVisible(false)}
      >
        <View style={styles.discountModalOverlay}>
          <View style={styles.discountModalContent}>
            <Text style={styles.discountModalTitle}>Order Discount</Text>

            <View style={styles.customDiscountRow}>
              <TouchableOpacity
                style={[
                  styles.discountTypeBtn,
                  orderDiscountInputType === 'percentage' && styles.discountTypeBtnActive,
                ]}
                onPress={() => setOrderDiscountInputType('percentage')}
              >
                <Text
                  style={[
                    styles.discountTypeText,
                    orderDiscountInputType === 'percentage' && styles.discountTypeTextActive,
                  ]}
                >
                  %
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.discountTypeBtn,
                  orderDiscountInputType === 'fixed' && styles.discountTypeBtnActive,
                ]}
                onPress={() => setOrderDiscountInputType('fixed')}
              >
                <Text
                  style={[
                    styles.discountTypeText,
                    orderDiscountInputType === 'fixed' && styles.discountTypeTextActive,
                  ]}
                >
                  $
                </Text>
              </TouchableOpacity>
              <TextInput
                style={styles.customDiscountInput}
                placeholder={orderDiscountInputType === 'percentage' ? 'e.g. 10' : 'e.g. 5.00'}
                placeholderTextColor="#6b7280"
                keyboardType="numeric"
                value={orderDiscountInputValue}
                onChangeText={setOrderDiscountInputValue}
              />
            </View>

            {/* Quick presets for order discount */}
            <View style={styles.discountPresets}>
              {[5, 10, 15, 20].map((pct) => (
                <TouchableOpacity
                  key={pct}
                  style={styles.discountPresetBtn}
                  onPress={() => {
                    setOrderDiscount({ type: 'percentage', value: pct });
                    setOrderDiscountModalVisible(false);
                  }}
                >
                  <Text style={styles.discountPresetText}>{pct}%</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.discountModalActions}>
              <TouchableOpacity style={styles.customDiscountApply} onPress={handleApplyOrderDiscount}>
                <Text style={styles.customDiscountApplyText}>Apply</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.discountModalCancelBtn}
                onPress={() => setOrderDiscountModalVisible(false)}
              >
                <Text style={styles.discountModalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Order Note Modal ──────────────────────────────────────────── */}
      <Modal
        visible={noteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNoteModalVisible(false)}
      >
        <View style={styles.discountModalOverlay}>
          <View style={styles.discountModalContent}>
            <Text style={styles.discountModalTitle}>Order Note</Text>
            <TextInput
              style={styles.noteTextInput}
              placeholder="e.g. Extra napkins, Birthday order..."
              placeholderTextColor="#6b7280"
              value={noteInput}
              onChangeText={setNoteInput}
              multiline
              numberOfLines={3}
              maxLength={200}
              autoFocus
            />
            <View style={styles.discountModalActions}>
              <TouchableOpacity style={styles.customDiscountApply} onPress={saveNote}>
                <Text style={styles.customDiscountApplyText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.discountModalCancelBtn}
                onPress={() => setNoteModalVisible(false)}
              >
                <Text style={styles.discountModalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  productImage: { width: 48, height: 48, borderRadius: 8, marginBottom: 6 },
  productImagePlaceholder: { width: 48, height: 48, borderRadius: 8, marginBottom: 6, alignItems: 'center', justifyContent: 'center' },
  productImagePlaceholderText: { fontSize: 20, fontWeight: '700' },
  productEmoji: { fontSize: 28, marginBottom: 6 },
  productName: { color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  productPrice: { color: '#a5b4fc', fontSize: 13, fontWeight: 'bold' },
  qtyBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: '#818cf8', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  qtyBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  cartTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
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

  // ── Header bar (table + wholesale toggle) ──────────────────────────────
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  tableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a3a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  tableBtnText: { color: '#d1d5db', fontSize: 13, fontWeight: '500' },
  tableBadge: {
    backgroundColor: '#818cf8',
    borderRadius: 8,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  tableBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  wholesaleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wholesaleLabel: { color: '#9ca3af', fontSize: 12, fontWeight: '500' },
  wholesaleLabelActive: { color: '#818cf8' },

  // ── Product original price (strikethrough for wholesale) ───────────────
  productOriginalPrice: {
    color: '#6b7280',
    fontSize: 10,
    textDecorationLine: 'line-through',
  },

  // ── Cart header with table badge ───────────────────────────────────────
  cartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cartTableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a3a',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  cartTableBadgeText: { color: '#818cf8', fontSize: 11, fontWeight: '600' },

  // ── Table selection modal ──────────────────────────────────────────────
  tableModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableModalContent: {
    backgroundColor: '#1e1e2e',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  tableModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  tableModalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  tableModalScroll: { flexGrow: 0 },
  tableGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  tableGridItem: {
    width: 60,
    height: 60,
    backgroundColor: '#2a2a3a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableGridItemActive: {
    backgroundColor: '#3730a3',
    borderWidth: 2,
    borderColor: '#818cf8',
  },
  tableGridItemText: { color: '#d1d5db', fontSize: 18, fontWeight: '600' },
  tableGridItemTextActive: { color: '#fff' },
  clearTableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    padding: 10,
    gap: 6,
  },
  clearTableBtnText: { color: '#ef4444', fontSize: 13, fontWeight: '500' },

  // ── Cart header left (title + table badge) ───────────────────────────────
  cartHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // ── Note button and preview ──────────────────────────────────────────────
  noteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#2a2a3a',
  },
  noteBtnText: { color: '#6b7280', fontSize: 12 },
  noteBtnTextActive: { color: '#818cf8' },
  notePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2a2a3a',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 8,
  },
  notePreviewText: { flex: 1, color: '#a5b4fc', fontSize: 11 },

  // ── Cart item discount styling ───────────────────────────────────────────
  cartItemOriginalPrice: {
    color: '#6b7280',
    fontSize: 11,
    textDecorationLine: 'line-through',
  },
  cartItemDiscountLabel: { color: '#f59e0b', fontSize: 11, marginTop: 1 },

  // ── Discount totals in summary ───────────────────────────────────────────
  discountLabel: { color: '#f59e0b', fontSize: 13 },
  discountValue: { color: '#f59e0b', fontSize: 13 },
  orderDiscountRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  removeDiscountBtn: { padding: 2 },
  addOrderDiscountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    marginBottom: 6,
  },
  addOrderDiscountText: { color: '#818cf8', fontSize: 12 },

  // ── Discount & note modals ───────────────────────────────────────────────
  discountModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  discountModalContent: {
    width: '85%',
    maxWidth: 400,
    backgroundColor: '#1e1e2e',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  discountModalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  discountModalSubtitle: { color: '#9ca3af', fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  discountModalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  discountModalCancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  discountModalCancelText: { color: '#9ca3af', fontSize: 14 },

  // ── Discount presets ─────────────────────────────────────────────────────
  discountPresets: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  discountPresetBtn: {
    flex: 1,
    backgroundColor: '#2a2a3a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  discountPresetText: { color: '#818cf8', fontSize: 15, fontWeight: '700' },

  // ── Custom discount row ──────────────────────────────────────────────────
  customDiscountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discountTypeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2a2a3a',
  },
  discountTypeBtnActive: { backgroundColor: '#4f46e5' },
  discountTypeText: { color: '#9ca3af', fontSize: 15, fontWeight: '700' },
  discountTypeTextActive: { color: '#fff' },
  customDiscountInput: {
    flex: 1,
    backgroundColor: '#2a2a3a',
    borderRadius: 8,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  customDiscountApply: {
    backgroundColor: '#818cf8',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  customDiscountApplyText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // ── Remove discount action ───────────────────────────────────────────────
  removeDiscountAction: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#3b1f1f',
  },
  removeDiscountActionText: { color: '#f87171', fontSize: 14, fontWeight: '600' },

  // ── Note text input ──────────────────────────────────────────────────────
  noteTextInput: {
    backgroundColor: '#2a2a3a',
    borderRadius: 10,
    color: '#fff',
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
