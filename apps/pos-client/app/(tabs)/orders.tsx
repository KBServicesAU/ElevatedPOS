import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type OrderStatus = 'completed' | 'pending' | 'refunded' | 'void';
type Channel = 'In-Store' | 'Online' | 'Delivery';

interface ShiftOrder {
  id: string;
  orderNumber: string;
  channel: Channel;
  items: string[];
  total: number;
  status: OrderStatus;
  time: string;
  paymentMethod: 'card' | 'cash';
}

const SHIFT_ORDERS: ShiftOrder[] = [
  {
    id: 'o1', orderNumber: '1042', channel: 'Delivery',
    items: ['Cold Brew x2', 'Banana Bread x2', 'Oat Milk Latte'],
    total: 28.60, status: 'pending', time: '10:48 AM', paymentMethod: 'card',
  },
  {
    id: 'o2', orderNumber: '1041', channel: 'In-Store',
    items: ['Iced Latte'],
    total: 6.60, status: 'completed', time: '10:45 AM', paymentMethod: 'card',
  },
  {
    id: 'o3', orderNumber: '1040', channel: 'Online',
    items: ['Flat White x2', 'Croissant', 'Avocado Toast'],
    total: 33.55, status: 'completed', time: '10:36 AM', paymentMethod: 'card',
  },
  {
    id: 'o4', orderNumber: '1039', channel: 'In-Store',
    items: ['Pour Over'],
    total: 8.80, status: 'completed', time: '10:20 AM', paymentMethod: 'cash',
  },
  {
    id: 'o5', orderNumber: '1038', channel: 'In-Store',
    items: ['Flat White', 'Croissant x2'],
    total: 14.85, status: 'refunded', time: '10:08 AM', paymentMethod: 'card',
  },
  {
    id: 'o6', orderNumber: '1037', channel: 'Online',
    items: ['Cold Brew', 'Banana Bread'],
    total: 10.45, status: 'completed', time: '9:52 AM', paymentMethod: 'card',
  },
  {
    id: 'o7', orderNumber: '1036', channel: 'In-Store',
    items: ['Eggs Benedict', 'Iced Latte'],
    total: 26.40, status: 'completed', time: '9:41 AM', paymentMethod: 'card',
  },
  {
    id: 'o8', orderNumber: '1035', channel: 'In-Store',
    items: ['Pour Over x2'],
    total: 17.60, status: 'void', time: '9:30 AM', paymentMethod: 'cash',
  },
];

const statusConfig: Record<OrderStatus, { label: string; bg: string; text: string }> = {
  completed: { label: 'Completed', bg: '#14532d', text: '#86efac' },
  pending:   { label: 'Pending',   bg: '#1e3a5f', text: '#93c5fd' },
  refunded:  { label: 'Refunded',  bg: '#3b1f1f', text: '#fca5a5' },
  void:      { label: 'Void',      bg: '#2a2a2a', text: '#9ca3af' },
};

const channelConfig: Record<Channel, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  'In-Store': { icon: 'storefront-outline', color: '#9ca3af' },
  Online:     { icon: 'globe-outline',      color: '#93c5fd' },
  Delivery:   { icon: 'bicycle-outline',    color: '#fdba74' },
};

type FilterTab = 'All' | OrderStatus;
const FILTER_TABS: FilterTab[] = ['All', 'completed', 'pending', 'refunded', 'void'];

export default function OrdersScreen() {
  const [filter, setFilter] = useState<FilterTab>('All');

  const visible = SHIFT_ORDERS.filter(
    (o) => filter === 'All' || o.status === filter
  );

  const shiftTotal = SHIFT_ORDERS
    .filter((o) => o.status === 'completed')
    .reduce((s, o) => s + o.total, 0);

  return (
    <SafeAreaView style={styles.container}>
      {/* Shift summary bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{SHIFT_ORDERS.filter((o) => o.status === 'completed').length}</Text>
          <Text style={styles.summaryLabel}>Completed</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>${shiftTotal.toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Shift Sales</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{SHIFT_ORDERS.filter((o) => o.status === 'pending').length}</Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabContent}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setFilter(tab)}
            style={[styles.tab, filter === tab && styles.tabActive]}
          >
            <Text style={[styles.tabText, filter === tab && styles.tabTextActive]}>
              {tab === 'All' ? 'All' : statusConfig[tab as OrderStatus].label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Order list */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {visible.map((order) => {
          const sc = statusConfig[order.status];
          const cc = channelConfig[order.channel];
          return (
            <TouchableOpacity key={order.id} style={styles.orderCard} activeOpacity={0.75}>
              <View style={styles.orderTop}>
                <View style={styles.orderLeft}>
                  <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
                  <View style={styles.channelRow}>
                    <Ionicons name={cc.icon} size={13} color={cc.color} />
                    <Text style={[styles.channelText, { color: cc.color }]}>{order.channel}</Text>
                  </View>
                </View>
                <View style={styles.orderRight}>
                  <Text style={styles.orderTotal}>${order.total.toFixed(2)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusText, { color: sc.text }]}>{sc.label}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.itemsRow}>
                <Text style={styles.itemsText} numberOfLines={1}>
                  {order.items.join(', ')}
                </Text>
              </View>

              <View style={styles.orderBottom}>
                <View style={styles.payRow}>
                  <Ionicons
                    name={order.paymentMethod === 'card' ? 'card-outline' : 'cash-outline'}
                    size={13}
                    color="#6b7280"
                  />
                  <Text style={styles.payText}>
                    {order.paymentMethod === 'card' ? 'Card' : 'Cash'}
                  </Text>
                </View>
                <Text style={styles.orderTime}>{order.time}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {visible.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={40} color="#374151" />
            <Text style={styles.emptyText}>No orders</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e2e' },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#16161f',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3a',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  summaryLabel: { color: '#6b7280', fontSize: 11, marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: '#2a2a3a', marginHorizontal: 8 },
  tabScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: '#2a2a3a' },
  tabContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#2a2a3a',
  },
  tabActive: { backgroundColor: '#818cf8' },
  tabText: { color: '#9ca3af', fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: '#fff' },
  list: { flex: 1 },
  listContent: { padding: 12, gap: 10 },
  orderCard: {
    backgroundColor: '#16161f',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  orderLeft: { gap: 4 },
  orderNumber: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  channelText: { fontSize: 12 },
  orderRight: { alignItems: 'flex-end', gap: 4 },
  orderTotal: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: '600' },
  itemsRow: { marginBottom: 8 },
  itemsText: { color: '#6b7280', fontSize: 12 },
  orderBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  payText: { color: '#6b7280', fontSize: 12 },
  orderTime: { color: '#4b5563', fontSize: 12 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { color: '#4b5563', fontSize: 14 },
});
