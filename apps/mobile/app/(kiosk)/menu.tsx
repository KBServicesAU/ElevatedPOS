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
import { useKioskStore, t } from '../../store/kiosk';
import { useCatalogStore } from '../../store/catalog';

const FONT_SIZE_KEY = '@kiosk_font_size';
type FontSize = 'small' | 'medium' | 'large';

const FONT_SCALE: Record<FontSize, number> = {
  small: 0.85,
  medium: 1,
  large: 1.2,
};

// Products and categories now fetched from the real catalog API

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  emoji: string;
  description: string;
  ageRestricted: boolean;
  tags: string[];
}

export default function MenuScreen() {
  const router = useRouter();
  const { cartItems, addToCart, ageVerified, setAgeVerified, setPendingAgeRestrictedProductId, language } =
    useKioskStore();
  const { products: catalogProducts, categories: catalogCategories, fetchAll, unavailable, hydrateUnavailable, loading: catalogLoading, error: catalogError } = useCatalogStore();
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [search, setSearch] = useState('');

  // Fetch real catalog and hydrate unavailable list on mount
  useEffect(() => {
    hydrateUnavailable();
    fetchAll();
  }, []);

  // Build category list from real data
  const CATEGORIES = useMemo(() => {
    const names = catalogCategories.map(c => c.name);
    return ['All', ...names];
  }, [catalogCategories]);

  // Map catalog products to the Product shape used by the UI
  // Excludes products that are isActive===false or marked unavailable (86'd) on this device.
  const realProducts: Product[] = useMemo(() => {
    const catMap = new Map(catalogCategories.map(c => [c.id, c.name]));
    return catalogProducts
      .filter(p => p.isActive !== false && !unavailable.has(p.id))
      .map(p => {
        // The API may return extra fields not declared in CatalogProduct.
        // Cast to access ageRestricted and tags when present.
        const raw = p as typeof p & {
          ageRestricted?: boolean;
          tags?: string[];
          description?: string;
          emoji?: string;
        };
        const tags: string[] = Array.isArray(raw.tags) ? raw.tags : [];
        // Accept explicit ageRestricted flag OR the presence of an 'age-restricted' tag.
        const ageRestricted =
          raw.ageRestricted === true ||
          tags.some((tag) => tag.toLowerCase() === 'age-restricted');
        return {
          id: p.id,
          name: p.name,
          price: parseFloat(String(p.basePrice)) || 0, // already in dollars from catalog store
          category: (p.categoryId && catMap.get(p.categoryId)) ?? 'Other',
          emoji: raw.emoji ?? '',
          description: raw.description ?? '',
          ageRestricted,
          tags,
        };
      });
  }, [catalogProducts, catalogCategories, unavailable]);

  const [fontSize, setFontSize] = useState<FontSize>('medium');
  useEffect(() => {
    AsyncStorage.getItem(FONT_SIZE_KEY).then((val) => {
      if (val === 'small' || val === 'medium' || val === 'large') setFontSize(val);
    });
  }, []);
  const changeFontSize = useCallback(
    (size: FontSize) => {
      setFontSize(size);
      AsyncStorage.setItem(FONT_SIZE_KEY, size);
    },
    [],
  );
  const scale = FONT_SCALE[fontSize];

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

  const filteredProducts = useMemo(() => {
    return realProducts.filter((p) => {
      const matchesCategory = activeCategory === 'All' || p.category === activeCategory;
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, search, realProducts]);

  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const cartCount = cartItems.reduce((sum, item) => sum + item.qty, 0);

  function handleAdd(product: Product) {
    if (product.ageRestricted && !ageVerified) {
      setPendingAgeRestrictedProductId(product.id);
      addToCart({
        id: product.id,
        cartKey: `${product.id}_${Date.now()}`,
        name: product.name,
        price: product.price,
        qty: 1,
        modifiers: [],
      });
      router.push('/(kiosk)/age-verification');
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
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.topBar}>
        <TextInput
          style={[styles.searchInput, { fontSize: 14 * scale }]}
          placeholder={t(language, 'searchPlaceholder')}
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

      {ageVerified && (
        <View style={styles.ageVerifiedBanner}>
          <Text style={styles.ageVerifiedText}>{t(language, 'ageVerifiedBanner')}</Text>
          <TouchableOpacity onPress={() => setAgeVerified(false)}>
            <Text style={styles.ageVerifiedClear}>{t(language, 'removeLabel')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {catalogLoading && realProducts.length === 0 && (
        <View style={styles.statusBanner}>
          <Text style={styles.statusText}>Loading menu…</Text>
        </View>
      )}

      {!catalogLoading && catalogError && realProducts.length === 0 && (
        <View style={styles.statusBanner}>
          <Text style={[styles.statusText, { color: '#ef4444' }]}>{catalogError}</Text>
        </View>
      )}

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

      <Animated.View style={[styles.backToTopBtn, { opacity: backToTopOpacity }]} pointerEvents={showBackToTop ? 'auto' : 'none'}>
        <TouchableOpacity onPress={scrollToTop} style={styles.backToTopInner} activeOpacity={0.85}>
          <Text style={styles.backToTopText}>↑ Top</Text>
        </TouchableOpacity>
      </Animated.View>

      {cartCount > 0 && (
        <TouchableOpacity
          style={styles.cartBar}
          onPress={() => router.push('/(kiosk)/cart')}
          activeOpacity={0.9}
        >
          <View style={styles.cartCount}>
            <Text style={styles.cartCountText}>{cartCount}</Text>
          </View>
          <Text style={styles.cartBarText}>{t(language, 'viewOrder')}</Text>
          <Text style={styles.cartBarTotal}>${cartTotal.toFixed(2)}</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
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
  statusBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '600',
  },
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
