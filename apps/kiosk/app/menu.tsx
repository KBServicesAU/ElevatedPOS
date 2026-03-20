import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKioskStore } from '../store/kiosk';

const CATEGORIES = ['All', 'Food', 'Drinks', 'Desserts', 'Extras'] as const;

const MOCK_PRODUCTS = [
  { id: '1', name: 'Classic Burger', price: 18.5, category: 'Food', tags: [''], emoji: '🍔', description: 'Beef patty, lettuce, tomato, special sauce' },
  { id: '2', name: 'Veggie Wrap', price: 15.0, category: 'Food', tags: ['V', 'GF'], emoji: '🌯', description: 'Grilled vegetables, hummus, rocket' },
  { id: '3', name: 'Grilled Chicken', price: 22.0, category: 'Food', tags: ['GF'], emoji: '🍗', description: 'Free-range chicken, seasonal greens, aioli' },
  { id: '4', name: 'Fish & Chips', price: 24.0, category: 'Food', tags: [''], emoji: '🐟', description: 'Beer battered barramundi, shoestring fries' },
  { id: '5', name: 'Caesar Salad', price: 16.0, category: 'Food', tags: ['V'], emoji: '🥗', description: 'Cos lettuce, parmesan, croutons, caesar dressing' },
  { id: '6', name: 'Flat White', price: 5.5, category: 'Drinks', tags: [''], emoji: '☕', description: 'Single origin espresso, steamed milk' },
  { id: '7', name: 'Lemon Iced Tea', price: 6.0, category: 'Drinks', tags: ['V', 'GF'], emoji: '🍋', description: 'House-brewed iced tea with fresh lemon' },
  { id: '8', name: 'Freshly Squeezed OJ', price: 7.0, category: 'Drinks', tags: ['V', 'GF'], emoji: '🍊', description: 'Cold-pressed orange juice' },
  { id: '9', name: 'Chocolate Lava Cake', price: 12.0, category: 'Desserts', tags: ['V'], emoji: '🍫', description: 'Warm dark chocolate cake, vanilla bean ice cream' },
  { id: '10', name: 'Crème Brûlée', price: 11.0, category: 'Desserts', tags: ['V', 'GF'], emoji: '🍮', description: 'Classic French custard with caramelised sugar' },
  { id: '11', name: 'Garlic Bread', price: 7.0, category: 'Extras', tags: ['V'], emoji: '🥖', description: 'Sourdough, herb butter, parmesan' },
  { id: '12', name: 'Sweet Potato Fries', price: 9.0, category: 'Extras', tags: ['V', 'GF'], emoji: '🍟', description: 'With smoky chipotle mayo' },
] as const;

type Product = typeof MOCK_PRODUCTS[number];

export default function MenuScreen() {
  const router = useRouter();
  const { cartItems, addToCart } = useKioskStore();
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [search, setSearch] = useState('');

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
    addToCart({ id: product.id, name: product.name, price: product.price, qty: 1 });
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search menu…"
          placeholderTextColor="#666"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Category tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catContent}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.catTab, activeCategory === cat && styles.catTabActive]}
            onPress={() => setActiveCategory(cat)}
          >
            <Text style={[styles.catText, activeCategory === cat && styles.catTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Product grid */}
      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => {
          const inCart = cartItems.find((c) => c.id === item.id);
          return (
            <TouchableOpacity style={styles.productCard} onPress={() => handleAdd(item)} activeOpacity={0.8}>
              <View style={styles.productEmoji}>
                <Text style={styles.emojiText}>{item.emoji}</Text>
              </View>
              {item.tags.filter(Boolean).length > 0 && (
                <View style={styles.tagRow}>
                  {item.tags.filter(Boolean).map((tag) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Text style={styles.productName}>{item.name}</Text>
              <Text style={styles.productDesc} numberOfLines={2}>{item.description}</Text>
              <View style={styles.productFooter}>
                <Text style={styles.productPrice}>${item.price.toFixed(2)}</Text>
                <View style={[styles.addButton, inCart ? styles.addButtonActive : null]}>
                  <Text style={styles.addButtonText}>{inCart ? `+${inCart.qty}` : '+'}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Cart bar */}
      {cartCount > 0 && (
        <TouchableOpacity style={styles.cartBar} onPress={() => router.push('/cart')} activeOpacity={0.9}>
          <View style={styles.cartCount}>
            <Text style={styles.cartCountText}>{cartCount}</Text>
          </View>
          <Text style={styles.cartBarText}>View Order</Text>
          <Text style={styles.cartBarTotal}>${cartTotal.toFixed(2)}</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  searchRow: { paddingHorizontal: 16, paddingVertical: 12 },
  searchInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  catScroll: { flexGrow: 0 },
  catContent: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  catTab: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  catTabActive: { backgroundColor: '#f97316', borderColor: '#f97316' },
  catText: { fontSize: 14, fontWeight: '600', color: '#888' },
  catTextActive: { color: '#fff' },
  grid: { paddingHorizontal: 8, paddingBottom: 120, gap: 12 },
  productCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    margin: 4,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  productEmoji: {
    backgroundColor: '#111',
    borderRadius: 12,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emojiText: { fontSize: 40 },
  tagRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  tag: { backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' },
  tagText: { fontSize: 10, color: '#22c55e', fontWeight: '700' },
  productName: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 4 },
  productDesc: { fontSize: 12, color: '#666', marginBottom: 12, lineHeight: 16 },
  productFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  productPrice: { fontSize: 17, fontWeight: '800', color: '#f97316' },
  addButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f97316', alignItems: 'center', justifyContent: 'center' },
  addButtonActive: { backgroundColor: '#16a34a' },
  addButtonText: { fontSize: 20, fontWeight: '800', color: '#fff', lineHeight: 22 },
  cartBar: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#f97316',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  cartCount: { backgroundColor: '#fff', borderRadius: 12, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  cartCountText: { fontSize: 13, fontWeight: '800', color: '#f97316' },
  cartBarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  cartBarTotal: { fontSize: 18, fontWeight: '800', color: '#fff' },
});
