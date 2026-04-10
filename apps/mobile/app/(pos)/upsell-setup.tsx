/**
 * Kiosk Upsell Setup
 *
 * Lets the operator pick which products to suggest to customers at the
 * kiosk checkout step ("would you like fries with that?"). Up to a few
 * of these will be shown in a modal when the customer hits Proceed to
 * Payment, filtered to items not already in their cart.
 *
 * Persistence lives in the catalog store and is shared across kiosk
 * instances on the same device.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCatalogStore, type CatalogProduct } from '../../store/catalog';
import { toast } from '../../components/ui';

const SUGGEST_LIMIT = 6;

export default function UpsellSetupScreen() {
  const router = useRouter();
  const {
    products,
    loading,
    fetchAll,
    upsellProductIds,
    upsellHydrated,
    hydrateUpsell,
    toggleUpsell,
    clearUpsell,
  } = useCatalogStore();

  const [search, setSearch] = useState('');

  useEffect(() => {
    if (products.length === 0) fetchAll();
    if (!upsellHydrated) hydrateUpsell();
  }, [products.length, upsellHydrated, fetchAll, hydrateUpsell]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.sku?.toLowerCase().includes(q) ?? false),
        )
      : products;
    // Selected first, then alphabetical.
    return [...list].sort((a, b) => {
      const ai = upsellProductIds.has(a.id) ? 0 : 1;
      const bi = upsellProductIds.has(b.id) ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name);
    });
  }, [products, search, upsellProductIds]);

  const selectedCount = upsellProductIds.size;
  const overLimit = selectedCount > SUGGEST_LIMIT;

  async function handleToggle(p: CatalogProduct) {
    await toggleUpsell(p.id);
  }

  async function handleClearAll() {
    if (selectedCount === 0) return;
    await clearUpsell();
    toast.info('Cleared', 'All upsell items removed.');
  }

  const renderItem = ({ item }: { item: CatalogProduct }) => {
    const selected = upsellProductIds.has(item.id);
    const dotColor = item.category?.color ?? '#6366f1';
    return (
      <TouchableOpacity
        style={[styles.row, selected && styles.rowSelected]}
        onPress={() => handleToggle(item)}
        activeOpacity={0.85}
      >
        <View style={[styles.catDot, { backgroundColor: dotColor }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.productName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.productMeta} numberOfLines={1}>
            {item.category?.name ?? 'Uncategorised'} · ${item.basePrice}
          </Text>
        </View>
        <View style={[styles.checkbox, selected && styles.checkboxOn]}>
          {selected && <Ionicons name="checkmark" size={16} color="#000" />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Kiosk Upsell',
          headerStyle: { backgroundColor: '#141425' },
          headerTintColor: '#fff',
        }}
      />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Kiosk Upsell</Text>
          <Text style={styles.subtitle}>
            Pick the items you want to suggest at checkout. Up to{' '}
            {SUGGEST_LIMIT} will be shown to the customer per order.
          </Text>
        </View>
      </View>

      {/* ── Selection bar ── */}
      <View style={styles.selBar}>
        <View style={styles.selChip}>
          <Ionicons name="sparkles" size={14} color="#f59e0b" />
          <Text style={styles.selChipLabel}>Selected</Text>
          <Text
            style={[
              styles.selChipValue,
              overLimit && { color: '#ef4444' },
            ]}
          >
            {selectedCount}
          </Text>
        </View>
        {overLimit && (
          <Text style={styles.warningText}>
            Only the first {SUGGEST_LIMIT} will be shown.
          </Text>
        )}
        <TouchableOpacity
          onPress={handleClearAll}
          disabled={selectedCount === 0}
          style={[
            styles.clearBtn,
            selectedCount === 0 && { opacity: 0.4 },
          ]}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={14} color="#ef4444" />
          <Text style={styles.clearBtnText}>Clear all</Text>
        </TouchableOpacity>
      </View>

      {/* ── Search ── */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color="#666" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search products…"
          placeholderTextColor="#555"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={10}>
            <Ionicons name="close-circle" size={16} color="#555" />
          </TouchableOpacity>
        )}
      </View>

      {loading && products.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color="#6366f1" size="large" />
          <Text style={styles.loadingText}>Loading products…</Text>
        </View>
      ) : products.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cube-outline" size={48} color="#333" />
          <Text style={styles.placeholder}>No products found</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => fetchAll()}>
            <Text style={styles.refreshBtnText}>Refresh Catalog</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          extraData={upsellProductIds}
          ListFooterComponent={
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => router.back()}
              activeOpacity={0.85}
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  header: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 6 },
  title: { color: '#fff', fontSize: 22, fontWeight: '900' },
  subtitle: { color: '#666', fontSize: 12, marginTop: 4, lineHeight: 16 },

  selBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 12,
  },
  selChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#141425',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e1e2e',
  },
  selChipLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  selChipValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  warningText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ef444455',
    marginLeft: 'auto',
  },
  clearBtnText: { color: '#ef4444', fontSize: 11, fontWeight: '800' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141425',
    marginHorizontal: 18,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e1e2e',
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    padding: 0,
  },

  list: { paddingHorizontal: 16, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#141425',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1e1e2e',
  },
  rowSelected: {
    borderColor: '#f59e0b',
    backgroundColor: '#1a1a2e',
  },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  productName: { color: '#fff', fontSize: 14, fontWeight: '800' },
  productMeta: { color: '#888', fontSize: 11, marginTop: 2 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#3a3a4a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#666', fontSize: 13, marginTop: 8 },
  placeholder: { color: '#555', fontSize: 14 },
  refreshBtn: {
    marginTop: 12,
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  refreshBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  doneBtn: {
    marginTop: 12,
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
