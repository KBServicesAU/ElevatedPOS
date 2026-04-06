import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import UpsellModal from '../components/UpsellModal';
import { useKioskStore } from '../store/kiosk';

const CATEGORIES = ['All', 'Food', 'Drinks', 'Desserts', 'Extras'] as const;

const FONT_SIZE_KEY = '@kiosk_font_size';
type FontSize = 'small' | 'medium' | 'large';

const FONT_SCALE: Record<FontSize, number> = {
  small: 0.85,
  medium: 1,
  large: 1.2,
};

// TODO: Replace hardcoded product data with API call to GET /api/v1/catalog/products?channel=kiosk
const MOCK_PRODUCTS = [
  {
    id: '1',
    name: 'Classic Burger',
    price: 18.5,
    category: 'Food',
    tags: [''],
    emoji: '🍔',
    description: 'Beef patty, lettuce, tomato, special sauce',
    ageRestricted: false,
  },
  {
    id: '2',
    name: 'Veggie Wrap',
    price: 15.0,
    category: 'Food',
    tags: ['V', 'GF'],
    emoji: '🌯',
    description: 'Grilled vegetables, hummus, rocket',
    ageRestricted: false,
  },
  {
    id: '3',
    name: 'Grilled Chicken',
    price: 22.0,
    category: 'Food',
    tags: ['GF'],
    emoji: '🍗',
    description: 'Free-range chicken, seasonal greens, aioli',
    ageRestricted: false,
  },
  {
    id: '4',
    name: 'Fish & Chips',
    price: 24.0,
    category: 'Food',
    tags: [''],
    emoji: '🐟',
    description: 'Beer battered barramundi, shoestring fries',
    ageRestricted: false,
  },
  {
    id: '5',
    name: 'Caesar Salad',
    price: 16.0,
    category: 'Food',
    tags: ['V'],
    emoji: '🥗',
    description: 'Cos lettuce, parmesan, croutons, caesar dressing',
    ageRestricted: false,
  },
  {
    id: '6',
    name: 'Flat White',
    price: 5.5,
    category: 'Drinks',
    tags: [''],
    emoji: '☕',
    description: 'Single origin espresso, steamed milk',
    ageRestricted: false,
  },
  {
    id: '7',
    name: 'Lemon Iced Tea',
    price: 6.0,
    category: 'Drinks',
    tags: ['V', 'GF'],
    emoji: '🍋',
    description: 'House-brewed iced tea with fresh lemon',
    ageRestricted: false,
  },
  {
    id: '8',
    name: 'Freshly Squeezed OJ',
    price: 7.0,
    category: 'Drinks',
    tags: ['V', 'GF'],
    emoji: '🍊',
    description: 'Cold-pressed orange juice',
    ageRestricted: false,
  },
  {
    id: 'alc1',
    name: 'House Red Wine',
    price: 12.0,
    category: 'Drinks',
    tags: ['GF'],
    emoji: '🍷',
    description: 'Australian shiraz, 150ml serve',
    ageRestricted: true,
  },
  {
    id: 'alc2',
    name: 'Craft Beer',
    price: 10.0,
    category: 'Drinks',
    tags: [''],
    emoji: '🍺',
    description: 'Local IPA on tap, 285ml',
    ageRestricted: true,
  },
  {
    id: '9',
    name: 'Chocolate Lava Cake',
    price: 12.0,
    category: 'Desserts',
    tags: ['V'],
    emoji: '🍫',
    description: 'Warm dark chocolate cake, vanilla bean ice cream',
    ageRestricted: false,
  },
  {
    id: '10',
    name: 'Crème Brûlée',
    price: 11.0,
    category: 'Desserts',
    tags: ['V', 'GF'],
    emoji: '🍮',
    description: 'Classic French custard with caramelised sugar',
    ageRestricted: false,
  },
  {
    id: '11',
    name: 'Garlic Bread',
    price: 7.0,
    category: 'Extras',
    tags: ['V'],
    emoji: '🥖',
    description: 'Sourdough, herb butter, parmesan',
    ageRestricted: false,
  },
  {
    id: '12',
    name: 'Sweet Potato Fries',
    price: 9.0,
    category: 'Extras',
    tags: ['V', 'GF'],
    emoji: '🍟',
    description: 'With smoky chipotle mayo',
    ageRestricted: false,
  },
] as const;

type Product = (typeof MOCK_PRODUCTS)[number];

export default function MenuScreen() {
  const router = useRouter();
  const { cartItems, addToCart, ageVerified, setAgeVerified, setPendingAgeRestrictedProductId } =
    useKioskStore();
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [search, setSearch] = useState('');

  // Font size preference (persisted)
  const [fontSize, setFontSize] = useState<FontSize>('medium');
  useEffect(() => {
    AsyncStorage.getItem(FONT_SIZE_KEY)
      .then((val) => {
        if (val === 'small' || val === 'medium' || val === 'large') setFontSize(val);
      })
      .catch(() => {
        // Non-critical: font size preference could not be loaded; use default
      });
  }, []);
  const changeFontSize = useCallback(
    (size: FontSize) => {
      setFontSize(size);
      AsyncStorage.setItem(FONT_SIZE_KEY, size).catch(() => {
        // Non-critical: font size preference could not be saved
      });
    },
    [],
  );
  const scale = FONT_SCALE[fontSize];

  // Back-to-top
  const listRef = useRef<FlatList>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const backToTopOpacity = useRef(new Animated.Value(0)).current;

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const offsetY = e.nativeEvent.contentOffset.y;
    const should = offsetY > 300;
    if (should !== showBackToTop) {
      setShowBackToTop(should);
      Animated.timing(backToTopOpacity, {
        toValue: should ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }

  function scrollToTop() {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }

  // Upsell modal state
  const [upsellVisible, setUpsellVisible] = useState(false);
  const [lastAddedProductId, setLastAddedProductId] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    return MOCK_PRODUCTS.filter((p) => {
      const matchesCategory = activeCategory === 'All' || p.category === activeCategory;
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, search]);

  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const cartCount = cartItems.reduce((sum, item) => sum + item.qty, 0);

  function handleAdd(product: Product) {
    // Age restriction gate
    if (product.ageRestricted && !ageVerified) {
      setPendingAgeRestrictedProductId(product.id);
      // Pre-add to cart so removal on that screen is possible; mark as pending
      addToCart({
        id: product.id,
        cartKey: `${product.id}_${Date.now()}`,
        name: product.name,
        price: product.price,
        qty: 1,
        modifiers: [],
      });
      router.push('/age-verification');
      return;
    }

    addToCart({
      id: product.id,
      cartKey: `${product.id}_${Date.now()}`,
      name: product.name,
      price: product.price,
      qty: 1,
      modifiers: [],
    });

    // Show upsell only for non-restricted (or already verified) items
    const currentCount = cartItems.reduce((sum, i) => sum + i.qty, 0) + 1;
    if (currentCount <= 3) {
      setLastAddedProductId(product.id);
      setUpsellVisible(true);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Top bar: search + font size controls */}
      <View style={styles.topBar}>
        <TextInput
          style={[styles.searchInput, { fontSize: 14 * scale }]}
          placeholder="Search menu…"
          placeholderTextColor="#666"
          value={search}
          onChangeText={setSearch}
        />
        <View style={styles.fontControls}>
          {(['small', 'medium', 'large'] as FontSize[]).map((size) => (
            <TouchableOpacity
              key={size}
              style={[styles.fontBtn, fontSize === size && styles.fontBtnActive]}
              onPress={() => changeFontSize(size)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text
                style={[
                  styles.fontBtnText,
                  { fontSize: size === 'small' ? 12 : size === 'medium' ? 15 : 18 },
                  fontSize === size && styles.fontBtnTextActive,
                ]}
              >
                A
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Age verified indicator */}
      {ageVerified && (
        <View style={styles.ageVerifiedBanner}>
          <Text style={styles.ageVerifiedText}>✓ Age verified — alcohol & tobacco available</Text>
          <TouchableOpacity onPress={() => setAgeVerified(false)}>
            <Text style={styles.ageVerifiedClear}>Remove</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Category chips — horizontal with bounce */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.catScroll}
        contentContainerStyle={styles.catContent}
        bounces
        decelerationRate="fast"
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.catTab, activeCategory === cat && styles.catTabActive]}
            onPress={() => setActiveCategory(cat)}
          >
            <Text style={[styles.catText, { fontSize: 14 * scale }, activeCategory === cat && styles.catTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Product grid */}
      <FlatList
        ref={listRef}
        data={filteredProducts as readonly Product[]}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => {
          const inCart = cartItems.find((c) => c.id === item.id);
          return (
            <TouchableOpacity
              style={styles.productCard}
              onPress={() => handleAdd(item)}
              activeOpacity={0.8}
            >
              <View style={styles.productEmoji}>
                <Text style={styles.emojiText}>{item.emoji}</Text>
                {item.ageRestricted && (
                  <View style={styles.ageBadge}>
                    <Text style={styles.ageBadgeText}>18+</Text>
                  </View>
                )}
              </View>
              {item.tags.filter(Boolean).length > 0 && (
                <View style={styles.tagRow}>
                  {item.tags.filter(Boolean).map((tag: string) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Text style={[styles.productName, { fontSize: 15 * scale }]}>{item.name}</Text>
              <Text style={[styles.productDesc, { fontSize: 12 * scale }]} numberOfLines={2}>
                {item.description}
              </Text>
              <View style={styles.productFooter}>
                <Text style={[styles.productPrice, { fontSize: 17 * scale }]}>
                  ${item.price.toFixed(2)}
                </Text>
                <View style={[styles.addButton, inCart ? styles.addButtonActive : null]}>
                  <Text style={styles.addButtonText}>{inCart ? `+${inCart.qty}` : '+'}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Back to top button */}
      <Animated.View style={[styles.backToTopBtn, { opacity: backToTopOpacity }]} pointerEvents={showBackToTop ? 'auto' : 'none'}>
        <TouchableOpacity onPress={scrollToTop} style={styles.backToTopInner} activeOpacity={0.85}>
          <Text style={styles.backToTopText}>↑ Top</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Cart bar */}
      {cartCount > 0 && (
        <TouchableOpacity
          style={styles.cartBar}
          onPress={() => router.push('/cart')}
          activeOpacity={0.9}
        >
          <View style={styles.cartCount}>
            <Text style={styles.cartCountText}>{cartCount}</Text>
          </View>
          <Text style={styles.cartBarText}>View Order</Text>
          <Text style={styles.cartBarTotal}>${cartTotal.toFixed(2)}</Text>
        </TouchableOpacity>
      )}

      {/* Upsell modal */}
      <UpsellModal
        visible={upsellVisible}
        triggerProductId={lastAddedProductId}
        onDismiss={() => setUpsellVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    minHeight: 48,
  },
  fontControls: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: '#333',
  },
  fontBtn: {
    width: 32,
    height: 32,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontBtnActive: {
    backgroundColor: '#f59e0b',
  },
  fontBtnText: {
    color: '#666',
    fontWeight: '800',
  },
  fontBtnTextActive: {
    color: '#000',
  },

  // Age verified banner
  ageVerifiedBanner: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  ageVerifiedText: {
    fontSize: 13,
    color: '#22c55e',
    fontWeight: '600',
  },
  ageVerifiedClear: {
    fontSize: 12,
    color: '#666',
    textDecorationLine: 'underline',
  },

  // Category chips
  catScroll: { flexGrow: 0 },
  catContent: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  catTab: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 22,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    minHeight: 44,
    justifyContent: 'center',
  },
  catTabActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  catText: { fontWeight: '600', color: '#888' },
  catTextActive: { color: '#000' },

  // Product grid
  grid: { paddingHorizontal: 8, paddingBottom: 140, gap: 12 },
  productCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    margin: 4,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    minHeight: 80,
  },
  productEmoji: {
    backgroundColor: '#111',
    borderRadius: 12,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    position: 'relative',
  },
  emojiText: { fontSize: 40 },
  ageBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ageBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#fff',
  },
  tagRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  tag: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  tagText: { fontSize: 10, color: '#22c55e', fontWeight: '700' },
  productName: { fontWeight: '700', color: '#fff', marginBottom: 4 },
  productDesc: { color: '#666', marginBottom: 12, lineHeight: 16 },
  productFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  productPrice: { fontWeight: '800', color: '#f59e0b' },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonActive: { backgroundColor: '#16a34a' },
  addButtonText: { fontSize: 22, fontWeight: '800', color: '#000', lineHeight: 24 },

  // Back to top
  backToTopBtn: {
    position: 'absolute',
    right: 20,
    bottom: 120,
    zIndex: 10,
  },
  backToTopInner: {
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  backToTopText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f59e0b',
  },

  // Cart bar
  cartBar: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#f59e0b',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
    minHeight: 80,
  },
  cartCount: {
    backgroundColor: '#000',
    borderRadius: 14,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartCountText: { fontSize: 14, fontWeight: '800', color: '#f59e0b' },
  cartBarText: { fontSize: 20, fontWeight: '700', color: '#000' },
  cartBarTotal: { fontSize: 20, fontWeight: '800', color: '#000' },
});
