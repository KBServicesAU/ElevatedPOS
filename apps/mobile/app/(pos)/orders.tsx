import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDeviceStore } from '../../store/device';
import { useAuthStore } from '../../store/auth';

const API_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';

interface Order {
  id: string;
  orderNumber: string;
  total: number;
  status: string;
  channel: string;
  createdAt: string;
  lines?: { name: string; quantity: number; unitPrice: number }[];
}

export default function OrdersScreen() {
  const identity = useDeviceStore((s) => s.identity);
  const employeeToken = useAuthStore((s) => s.employeeToken);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = employeeToken ?? identity?.deviceToken ?? '';
    try {
      const locationId = identity?.locationId ?? '';
      const res = await fetch(`${API_BASE}/api/v1/orders?limit=50&locationId=${locationId}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.data ?? data ?? []);
      } else {
        const body = await res.text().catch(() => '');
        setError(`Error ${res.status}: ${body.substring(0, 100)}`);
      }
    } catch {
      setError('Could not load orders');
    } finally {
      setLoading(false);
    }
  }, [employeeToken, identity]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  function statusColor(status: string) {
    if (status === 'completed' || status === 'paid') return '#22c55e';
    if (status === 'pending') return '#f59e0b';
    if (status === 'cancelled' || status === 'refunded') return '#ef4444';
    return '#888';
  }

  function renderOrder({ item }: { item: Order }) {
    const time = new Date(item.createdAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    const date = new Date(item.createdAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
    const total = typeof item.total === 'number' ? (item.total / 100).toFixed(2) : '0.00';

    return (
      <View style={s.orderCard}>
        <View style={s.orderRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.orderNumber}>#{item.orderNumber}</Text>
            <Text style={s.orderTime}>{date} {time}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.orderTotal}>${total}</Text>
            <View style={[s.statusBadge, { backgroundColor: `${statusColor(item.status)}20`, borderColor: `${statusColor(item.status)}40` }]}>
              <Text style={[s.statusText, { color: statusColor(item.status) }]}>{item.status}</Text>
            </View>
          </View>
        </View>
        {item.lines && item.lines.length > 0 && (
          <View style={s.linesWrap}>
            {item.lines.slice(0, 3).map((line, i) => (
              <Text key={i} style={s.lineText}>{line.quantity}x {line.name}</Text>
            ))}
            {item.lines.length > 3 && <Text style={s.lineText}>+{item.lines.length - 3} more</Text>}
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <View style={s.header}>
        <Text style={s.title}>Orders</Text>
        <TouchableOpacity onPress={fetchOrders} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#6366f1" /> : <Ionicons name="refresh" size={20} color="#888" />}
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={s.center}>
          <Ionicons name="alert-circle" size={36} color="#ef4444" />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={fetchOrders}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : orders.length === 0 && !loading ? (
        <View style={s.center}>
          <Ionicons name="receipt-outline" size={36} color="#444" />
          <Text style={s.emptyText}>No orders yet</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          renderItem={renderOrder}
          contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
          refreshing={loading}
          onRefresh={fetchOrders}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e1e2e' },
  title: { fontSize: 20, fontWeight: '900', color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  errorText: { color: '#ef4444', fontSize: 14 },
  emptyText: { color: '#555', fontSize: 14 },
  retryBtn: { backgroundColor: '#6366f1', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  retryText: { color: '#fff', fontWeight: '700' },
  orderCard: { backgroundColor: '#141425', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#2a2a3a' },
  orderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  orderNumber: { fontSize: 16, fontWeight: '800', color: '#fff' },
  orderTime: { fontSize: 12, color: '#666', marginTop: 2 },
  orderTotal: { fontSize: 18, fontWeight: '900', color: '#6366f1' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  linesWrap: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#1e1e2e' },
  lineText: { fontSize: 12, color: '#888', lineHeight: 18 },
});
