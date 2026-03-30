import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Modal,
  SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { posApiFetch } from '../lib/api';
import ModifierModal, { type SelectedModifiers } from './ModifierModal';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModifierOption {
  id: string;
  name: string;
  priceDelta: number; // cents
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
}

export interface Product {
  id: string;
  name: string;
  sku?: string;
  price: number; // cents
  category?: string;
  categoryId?: string;
  modifierGroups?: ModifierGroup[];
  hasModifiers?: boolean;
}

interface ProductSearchProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (product: Product, modifiers: SelectedModifiers) => void;
}

const RECENT_KEY = 'recent_products';
const MAX_RECENT = 8;
const DEBOUNCE_MS = 300;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const CATEGORY_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#f97316', '#6366f1',
];

function categoryColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}

// ─── Product Row ──────────────────────────────────────────────────────────────

interface ProductRowProps {
  product: Product;
  onPress: (p: Product) => void;
}

function ProductRow({ product, onPress }: ProductRowProps) {
  const color = categoryColor(product.category ?? product.id);
  const initials = getInitials(product.name);
  const priceDisplay = `$${(product.price / 100).toFixed(2)}`;

  return (
    <TouchableOpacity style={ps.row} onPress={() => onPress(product)}>
      {/* Image placeholder */}
      <View style={[ps.avatar, { backgroundColor: `${color}33` }]}>
        <Text style={[ps.avatarText, { color }]}>{initials}</Text>
      </View>

      {/* Info */}
      <View style={ps.rowInfo}>
        <Text style={ps.rowName}>{product.name}</Text>
        {product.sku ? <Text style={ps.rowSku}>SKU: {product.sku}</Text> : null}
        {product.hasModifiers && (
          <Text style={ps.rowModTag}>Customisable</Text>
        )}
      </View>

      {/* Category + price */}
      <View style={ps.rowRight}>
        {product.category ? (
          <View style={[ps.catBadge, { backgroundColor: `${color}22` }]}>
            <Text style={[ps.catBadgeText, { color }]}>{product.category}</Text>
          </View>
        ) : null}
        <Text style={ps.rowPrice}>{priceDisplay}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProductSearch({ visible, onClose, onSelect }: ProductSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [recent, setRecent] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Load recent products on open
  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => {
        if (raw) setRecent(JSON.parse(raw) as Product[]);
      })
      .catch(() => undefined);
    // Auto-focus
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [visible]);

  const saveRecent = useCallback(async (product: Product) => {
    try {
      const raw = await AsyncStorage.getItem(RECENT_KEY);
      const prev: Product[] = raw ? JSON.parse(raw) : [];
      const next = [product, ...prev.filter((p) => p.id !== product.id)].slice(0, MAX_RECENT);
      await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
      setRecent(next);
    } catch {
      // non-critical
    }
  }, []);

  const doSearch = useCallback((text: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!text.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceTimer.current = setTimeout(async () => {
      // Primary: Typesense-backed search endpoint
      const searchParams = new URLSearchParams({ q: text.trim(), limit: '20' });
      try {
        const res = await posApiFetch<
          { results: Product[]; total: number } | { data: Product[] } | Product[]
        >(`/api/v1/search/products?${searchParams.toString()}`);
        // Handle both search response shape and legacy catalog shape
        if (res && !Array.isArray(res) && 'results' in res) {
          setResults((res as { results: Product[] }).results ?? []);
        } else {
          const list = Array.isArray(res) ? res : (res as { data: Product[] }).data ?? [];
          setResults(list);
        }
      } catch {
        // Fallback: catalog ILIKE search
        try {
          const fallbackParams = new URLSearchParams({ search: text.trim(), limit: '20' });
          const fallback = await posApiFetch<{ data: Product[] } | Product[]>(
            `/api/v1/catalog/products?${fallbackParams.toString()}`,
          );
          const list = Array.isArray(fallback)
            ? fallback
            : (fallback as { data: Product[] }).data ?? [];
          setResults(list);
        } catch {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
  }, []);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    doSearch(text);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  };

  const handleProductPress = async (product: Product) => {
    // If product has modifiers, show ModifierModal first
    if (product.hasModifiers || (product.modifierGroups && product.modifierGroups.length > 0)) {
      // Fetch full product details if modifierGroups aren't already loaded
      if (!product.modifierGroups || product.modifierGroups.length === 0) {
        try {
          const full = await posApiFetch<Product>(`/api/v1/catalog/products/${product.id}`);
          setPendingProduct(full);
        } catch {
          // Fallback: use product as-is with empty modifier groups
          setPendingProduct({ ...product, modifierGroups: [] });
        }
      } else {
        setPendingProduct(product);
      }
    } else {
      // No modifiers — select immediately
      await saveRecent(product);
      onSelect(product, {});
      handleClose();
    }
  };

  const handleModifierConfirm = async (modifiers: SelectedModifiers) => {
    if (!pendingProduct) return;
    await saveRecent(pendingProduct);
    onSelect(pendingProduct, modifiers);
    setPendingProduct(null);
    handleClose();
  };

  const handleModifierCancel = () => {
    setPendingProduct(null);
  };

  const handleClose = () => {
    handleClear();
    onClose();
  };

  const displayList = query.trim() ? results : recent;
  const showEmpty = !loading && query.trim() !== '' && results.length === 0;
  const showRecent = !query.trim() && recent.length > 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={ps.root}>
        {/* Header */}
        <View style={ps.header}>
          <View style={ps.searchBar}>
            <Ionicons name="search" size={18} color="#6b7280" />
            <TextInput
              ref={inputRef}
              style={ps.searchInput}
              placeholder="Search products by name or SKU…"
              placeholderTextColor="#4b5563"
              value={query}
              onChangeText={handleQueryChange}
              returnKeyType="search"
              autoCorrect={false}
            />
            {loading && <ActivityIndicator size="small" color="#818cf8" />}
            {!loading && query.length > 0 && (
              <TouchableOpacity onPress={handleClear}>
                <Ionicons name="close-circle" size={20} color="#6b7280" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={handleClose} style={ps.cancelBtn}>
            <Text style={ps.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {/* Section label */}
        {showRecent && (
          <View style={ps.sectionRow}>
            <Text style={ps.sectionLabel}>Recently Used</Text>
          </View>
        )}
        {query.trim() !== '' && !loading && (
          <View style={ps.sectionRow}>
            <Text style={ps.sectionLabel}>
              {results.length} result{results.length !== 1 ? 's' : ''}
            </Text>
          </View>
        )}

        {/* List */}
        {showEmpty ? (
          <View style={ps.empty}>
            <Ionicons name="search-outline" size={48} color="#374151" />
            <Text style={ps.emptyText}>No products found for "{query}"</Text>
          </View>
        ) : (
          <FlatList
            data={displayList}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ProductRow product={item} onPress={handleProductPress} />
            )}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={ps.separator} />}
            contentContainerStyle={ps.listContent}
            ListEmptyComponent={
              !loading && !query.trim() ? (
                <View style={ps.empty}>
                  <Ionicons name="time-outline" size={48} color="#374151" />
                  <Text style={ps.emptyText}>No recently used products</Text>
                  <Text style={ps.emptySubText}>Start typing to search the catalogue</Text>
                </View>
              ) : null
            }
          />
        )}

        {/* Modifier modal */}
        {pendingProduct && (
          <ModifierModal
            visible={!!pendingProduct}
            product={pendingProduct}
            onConfirm={handleModifierConfirm}
            onCancel={handleModifierCancel}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ps = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  searchInput: { flex: 1, color: '#f1f5f9', fontSize: 15 },
  cancelBtn: { paddingHorizontal: 4 },
  cancelText: { color: '#60a5fa', fontSize: 15 },
  sectionRow: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4b5563',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  listContent: { paddingBottom: 40 },
  separator: { height: 1, backgroundColor: '#0f3460', marginLeft: 72 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { color: '#6b7280', fontSize: 15, fontWeight: '500' },
  emptySubText: { color: '#374151', fontSize: 13 },
  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '700' },
  rowInfo: { flex: 1, gap: 2 },
  rowName: { color: '#e2e8f0', fontSize: 15, fontWeight: '500' },
  rowSku: { color: '#4b5563', fontSize: 11 },
  rowModTag: {
    color: '#a78bfa',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  catBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  catBadgeText: { fontSize: 11, fontWeight: '600' },
  rowPrice: { color: '#f1f5f9', fontSize: 15, fontWeight: '700' },
});
