/**
 * Wet / Dry Sales Setup
 *
 * Lets the operator tag every catalog category as either:
 *  - "wet" — drinks (beer, wine, spirits, soft drink, coffee, …)
 *  - "dry" — food (mains, sides, pastries, …)
 *  - none  — excluded from the wet/dry totals (e.g. retail, gift cards)
 *
 * The mapping is persisted to AsyncStorage and read back by the EOD screen
 * to break the day's revenue into wet vs dry buckets — a regulatory and
 * margin-tracking necessity for hospitality venues.
 */

import React, { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCatalogStore, type SalesType } from '../../store/catalog';
import { toast } from '../../components/ui';

export default function WetDrySetupScreen() {
  const router = useRouter();
  const {
    categories,
    loading,
    fetchAll,
    salesTypeByCategory,
    salesTypeHydrated,
    hydrateSalesType,
    setCategorySalesType,
  } = useCatalogStore();

  useEffect(() => {
    if (categories.length === 0) fetchAll();
    if (!salesTypeHydrated) hydrateSalesType();
  }, [categories.length, salesTypeHydrated, fetchAll, hydrateSalesType]);

  const counts = useMemo(() => {
    let wet = 0;
    let dry = 0;
    let none = 0;
    for (const cat of categories) {
      const type = salesTypeByCategory[cat.id];
      if (type === 'wet') wet++;
      else if (type === 'dry') dry++;
      else none++;
    }
    return { wet, dry, none };
  }, [categories, salesTypeByCategory]);

  async function handleSet(categoryId: string, type: SalesType | null) {
    await setCategorySalesType(categoryId, type);
    if (type) {
      toast.info('Updated', `Category set to ${type.toUpperCase()}.`);
    } else {
      toast.info('Cleared', 'Category removed from wet/dry split.');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Wet / Dry Setup',
          headerStyle: { backgroundColor: '#141425' },
          headerTintColor: '#fff',
        }}
      />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Wet / Dry Sales</Text>
          <Text style={styles.subtitle}>
            Tag each category to split daily revenue into beverage and food totals.
          </Text>
        </View>
      </View>

      {/* ── Summary chips ── */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryChip, { borderColor: '#06b6d455' }]}>
          <View style={[styles.summaryDot, { backgroundColor: '#06b6d4' }]} />
          <Text style={styles.summaryLabel}>WET</Text>
          <Text style={styles.summaryValue}>{counts.wet}</Text>
        </View>
        <View style={[styles.summaryChip, { borderColor: '#f59e0b55' }]}>
          <View style={[styles.summaryDot, { backgroundColor: '#f59e0b' }]} />
          <Text style={styles.summaryLabel}>DRY</Text>
          <Text style={styles.summaryValue}>{counts.dry}</Text>
        </View>
        <View style={[styles.summaryChip, { borderColor: '#33333355' }]}>
          <View style={[styles.summaryDot, { backgroundColor: '#444' }]} />
          <Text style={styles.summaryLabel}>NONE</Text>
          <Text style={styles.summaryValue}>{counts.none}</Text>
        </View>
      </View>

      {loading && categories.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color="#6366f1" size="large" />
          <Text style={styles.loadingText}>Loading categories…</Text>
        </View>
      ) : categories.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="albums-outline" size={48} color="#333" />
          <Text style={styles.placeholder}>No categories found</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => fetchAll()}>
            <Text style={styles.refreshBtnText}>Refresh Catalog</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {categories.map((cat) => {
            const current = salesTypeByCategory[cat.id] ?? null;
            const dotColor = cat.color ?? '#6366f1';
            return (
              <View key={cat.id} style={styles.row}>
                <View style={styles.rowLeft}>
                  <View
                    style={[styles.catDot, { backgroundColor: dotColor }]}
                  />
                  <Text style={styles.catName} numberOfLines={1}>
                    {cat.name}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <TouchableOpacity
                    style={[
                      styles.pill,
                      current === 'wet' && {
                        backgroundColor: '#06b6d4',
                        borderColor: '#06b6d4',
                      },
                    ]}
                    onPress={() => handleSet(cat.id, current === 'wet' ? null : 'wet')}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        current === 'wet' && { color: '#000' },
                      ]}
                    >
                      WET
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.pill,
                      current === 'dry' && {
                        backgroundColor: '#f59e0b',
                        borderColor: '#f59e0b',
                      },
                    ]}
                    onPress={() => handleSet(cat.id, current === 'dry' ? null : 'dry')}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        current === 'dry' && { color: '#000' },
                      ]}
                    >
                      DRY
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  header: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 6,
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '900' },
  subtitle: { color: '#666', fontSize: 12, marginTop: 4, lineHeight: 16 },
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

  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 10,
  },
  summaryChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#141425',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  summaryDot: { width: 10, height: 10, borderRadius: 5 },
  summaryLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  summaryValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    marginLeft: 'auto',
  },

  scroll: { paddingHorizontal: 16, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141425',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1e1e2e',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catName: { color: '#eee', fontSize: 14, fontWeight: '700', flex: 1 },
  rowRight: {
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    borderWidth: 1.5,
    borderColor: '#2a2a3a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#0d0d14',
  },
  pillText: {
    color: '#888',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  doneBtn: {
    marginTop: 12,
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
