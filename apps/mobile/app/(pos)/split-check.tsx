/**
 * Split Check by Seat
 *
 * Lets the cashier divide the open ticket into separate sub-checks based
 * on which guest at the table ordered each item. The "shared" pile holds
 * any items that haven't been assigned yet — sharing items between seats
 * automatically splits the cost on the printed bills.
 */

import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePosStore, type PosCartItem } from '../../store/pos';
import { toast } from '../../components/ui';

interface SeatBucket {
  seat: number | null;
  items: PosCartItem[];
  total: number;
}

export default function SplitCheckScreen() {
  const router = useRouter();
  const cart = usePosStore((s) => s.cart);
  const seatCount = usePosStore((s) => s.seatCount);
  const setSeatCount = usePosStore((s) => s.setSeatCount);
  const assignSeat = usePosStore((s) => s.assignSeat);

  const [movingItem, setMovingItem] = useState<PosCartItem | null>(null);

  const buckets: SeatBucket[] = useMemo(() => {
    const out: SeatBucket[] = [
      { seat: null, items: [], total: 0 },
    ];
    for (let i = 1; i <= seatCount; i++) {
      out.push({ seat: i, items: [], total: 0 });
    }
    for (const line of cart) {
      const bucket = out.find((b) => (b.seat ?? null) === (line.seat ?? null));
      if (bucket) {
        bucket.items.push(line);
        const itemDisc = line.discount
          ? line.discountType === '%'
            ? (line.price * line.discount) / 100
            : line.discount
          : 0;
        bucket.total += (line.price - Math.min(itemDisc, line.price)) * line.qty;
      }
    }
    return out;
  }, [cart, seatCount]);

  const grandTotal = buckets.reduce((s, b) => s + b.total, 0);

  function handleAssign(seat: number | undefined) {
    if (!movingItem) return;
    assignSeat(movingItem.cartKey, seat);
    setMovingItem(null);
    toast.info(
      'Moved',
      seat ? `${movingItem.name} sent to Seat ${seat}.` : `${movingItem.name} returned to Shared.`,
    );
  }

  function handleSeatPlus() {
    setSeatCount(seatCount + 1);
  }

  function handleSeatMinus() {
    if (seatCount <= 1) return;
    // Reassign any items from the dropped seat back to shared.
    for (const line of cart) {
      if (line.seat === seatCount) assignSeat(line.cartKey, undefined);
    }
    setSeatCount(seatCount - 1);
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Split Check',
          headerStyle: { backgroundColor: '#141425' },
          headerTintColor: '#fff',
        }}
      />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Split Check by Seat</Text>
          <Text style={styles.subtitle}>{cart.length} items · ${grandTotal.toFixed(2)} total</Text>
        </View>
        <View style={styles.seatCounter}>
          <TouchableOpacity onPress={handleSeatMinus} style={styles.seatBtn}>
            <Ionicons name="remove" size={18} color="#fff" />
          </TouchableOpacity>
          <View style={styles.seatCountBox}>
            <Text style={styles.seatCountLabel}>Seats</Text>
            <Text style={styles.seatCountValue}>{seatCount}</Text>
          </View>
          <TouchableOpacity onPress={handleSeatPlus} style={styles.seatBtn}>
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {cart.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={48} color="#333" />
          <Text style={styles.placeholder}>The cart is empty. Add items before splitting.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
            <Text style={styles.primaryBtnText}>Back to Sell</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
          {buckets.map((bucket) => (
            <View
              key={bucket.seat ?? 'shared'}
              style={[
                styles.bucket,
                bucket.seat === null && { borderColor: '#444' },
                bucket.seat !== null && {
                  borderColor: SEAT_COLORS[(bucket.seat - 1) % SEAT_COLORS.length],
                },
              ]}
            >
              <View style={styles.bucketHeader}>
                <View
                  style={[
                    styles.seatBadge,
                    {
                      backgroundColor:
                        bucket.seat === null
                          ? '#2a2a3a'
                          : SEAT_COLORS[(bucket.seat - 1) % SEAT_COLORS.length],
                    },
                  ]}
                >
                  <Text style={styles.seatBadgeText}>
                    {bucket.seat === null ? 'S' : bucket.seat}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bucketTitle}>
                    {bucket.seat === null ? 'Shared' : `Seat ${bucket.seat}`}
                  </Text>
                  <Text style={styles.bucketSub}>
                    {bucket.items.length} {bucket.items.length === 1 ? 'item' : 'items'}
                  </Text>
                </View>
                <Text style={styles.bucketTotal}>${bucket.total.toFixed(2)}</Text>
              </View>

              {bucket.items.length === 0 ? (
                <View style={styles.bucketEmpty}>
                  <Text style={styles.bucketEmptyText}>
                    {bucket.seat === null
                      ? 'No unassigned items.'
                      : 'No items assigned to this seat. Tap an item from another seat to move it here.'}
                  </Text>
                </View>
              ) : (
                bucket.items.map((line) => (
                  <TouchableOpacity
                    key={`${line.id}_${line.seat ?? 'shared'}`}
                    style={styles.line}
                    onPress={() => setMovingItem(line)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.lineQty}>{line.qty}×</Text>
                    <Text style={styles.lineName} numberOfLines={1}>
                      {line.name}
                    </Text>
                    <Text style={styles.linePrice}>
                      ${(line.price * line.qty).toFixed(2)}
                    </Text>
                    <Ionicons name="swap-horizontal" size={14} color="#666" />
                  </TouchableOpacity>
                ))
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── Move-to-seat sheet ── */}
      <Modal visible={!!movingItem} transparent animationType="fade" onRequestClose={() => setMovingItem(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMovingItem(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Move {movingItem?.name}</Text>
            <Text style={styles.modalSubtitle}>Choose a seat</Text>
            <View style={styles.seatGrid}>
              <TouchableOpacity
                style={[styles.seatPick, { borderColor: '#444' }]}
                onPress={() => handleAssign(undefined)}
              >
                <Text style={styles.seatPickText}>Shared</Text>
              </TouchableOpacity>
              {Array.from({ length: seatCount }, (_, i) => i + 1).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.seatPick,
                    { borderColor: SEAT_COLORS[(s - 1) % SEAT_COLORS.length] },
                  ]}
                  onPress={() => handleAssign(s)}
                >
                  <Text
                    style={[
                      styles.seatPickText,
                      { color: SEAT_COLORS[(s - 1) % SEAT_COLORS.length] },
                    ]}
                  >
                    Seat {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setMovingItem(null)} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: '#666', fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const SEAT_COLORS = [
  '#6366f1',
  '#22c55e',
  '#f59e0b',
  '#06b6d4',
  '#ec4899',
  '#a855f7',
  '#ef4444',
  '#14b8a6',
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '900' },
  subtitle: { color: '#666', fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  placeholder: { color: '#555', fontSize: 14 },
  seatCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#141425',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    padding: 4,
  },
  seatBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatCountBox: { alignItems: 'center', paddingHorizontal: 10 },
  seatCountLabel: { color: '#666', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  seatCountValue: { color: '#fff', fontSize: 16, fontWeight: '900' },

  bucket: {
    backgroundColor: '#141425',
    borderRadius: 14,
    borderWidth: 2,
    padding: 12,
  },
  bucketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  seatBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatBadgeText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  bucketTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  bucketSub: { color: '#666', fontSize: 11, marginTop: 1 },
  bucketTotal: { color: '#fff', fontSize: 15, fontWeight: '900' },
  bucketEmpty: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  bucketEmptyText: { color: '#444', fontSize: 11, textAlign: 'center', lineHeight: 16 },

  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
  },
  lineQty: { color: '#888', fontSize: 13, fontWeight: '700', width: 32 },
  lineName: { flex: 1, color: '#ccc', fontSize: 13 },
  linePrice: { color: '#fff', fontSize: 13, fontWeight: '700' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1a1a2e',
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 2 },
  modalSubtitle: { color: '#666', fontSize: 12, marginBottom: 14 },
  seatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  seatPick: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: '#0d0d14',
  },
  seatPickText: { fontSize: 13, fontWeight: '800', color: '#888' },

  primaryBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 22,
    marginTop: 12,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
