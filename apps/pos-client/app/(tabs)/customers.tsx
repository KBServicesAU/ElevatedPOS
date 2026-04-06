import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Tier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  tier: Tier;
  points: number;
  visits: number;
  lastVisit: string;
  totalSpend: number;
}

// TODO: Replace hardcoded customer data with API call to GET /api/v1/customers
const CUSTOMERS: Customer[] = [
  {
    id: 'c1', name: 'Sarah Mitchell', email: 'sarah.m@email.com', phone: '(555) 012-3456',
    tier: 'Platinum', points: 4820, visits: 143, lastVisit: 'Today', totalSpend: 892.40,
  },
  {
    id: 'c2', name: 'James Okafor', email: 'james.o@email.com', phone: '(555) 234-5678',
    tier: 'Gold', points: 2150, visits: 67, lastVisit: 'Yesterday', totalSpend: 418.75,
  },
  {
    id: 'c3', name: 'Priya Nair', email: 'priya.n@email.com', phone: '(555) 345-6789',
    tier: 'Gold', points: 1890, visits: 52, lastVisit: '2 days ago', totalSpend: 361.20,
  },
  {
    id: 'c4', name: 'Tom Becker', email: 'tom.b@email.com', phone: '(555) 456-7890',
    tier: 'Silver', points: 780, visits: 24, lastVisit: '1 week ago', totalSpend: 154.90,
  },
  {
    id: 'c5', name: 'Chloe Dupont', email: 'chloe.d@email.com', phone: '(555) 567-8901',
    tier: 'Silver', points: 610, visits: 19, lastVisit: '3 days ago', totalSpend: 122.60,
  },
  {
    id: 'c6', name: 'Marcus Lee', email: 'marcus.l@email.com', phone: '(555) 678-9012',
    tier: 'Bronze', points: 230, visits: 8, lastVisit: '2 weeks ago', totalSpend: 46.80,
  },
  {
    id: 'c7', name: 'Amara Jones', email: 'amara.j@email.com', phone: '(555) 789-0123',
    tier: 'Bronze', points: 90, visits: 3, lastVisit: '1 month ago', totalSpend: 18.20,
  },
];

const tierConfig: Record<Tier, { bg: string; text: string; icon: string }> = {
  Bronze:   { bg: '#3b2a1a', text: '#d97706', icon: '🥉' },
  Silver:   { bg: '#1f2937', text: '#9ca3af', icon: '🥈' },
  Gold:     { bg: '#2d2200', text: '#fbbf24', icon: '🥇' },
  Platinum: { bg: '#1a1a3a', text: '#a5b4fc', icon: '💎' },
};

export default function CustomersScreen() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);

  const filtered = CUSTOMERS.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
  );

  if (selected) {
    const tc = tierConfig[selected.tier];
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={() => setSelected(null)} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color="#818cf8" />
            <Text style={styles.backText}>Customers</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent}>
          {/* Avatar */}
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {selected.name.split(' ').map((n) => n[0]).join('')}
            </Text>
          </View>
          <Text style={styles.detailName}>{selected.name}</Text>
          <View style={[styles.tierBadge, { backgroundColor: tc.bg }]}>
            <Text style={styles.tierIcon}>{tc.icon}</Text>
            <Text style={[styles.tierLabel, { color: tc.text }]}>{selected.tier}</Text>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{selected.points.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Points</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{selected.visits}</Text>
              <Text style={styles.statLabel}>Visits</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>${selected.totalSpend.toFixed(0)}</Text>
              <Text style={styles.statLabel}>Total Spent</Text>
            </View>
          </View>

          {/* Contact info */}
          <View style={styles.infoSection}>
            <Text style={styles.infoSectionTitle}>Contact</Text>
            <View style={styles.infoRow}>
              <Ionicons name="mail-outline" size={16} color="#6b7280" />
              <Text style={styles.infoText}>{selected.email}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={16} color="#6b7280" />
              <Text style={styles.infoText}>{selected.phone}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={16} color="#6b7280" />
              <Text style={styles.infoText}>Last visit: {selected.lastVisit}</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actionSection}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() =>
                Alert.alert(
                  'Link Customer',
                  `Link ${selected.name} to the current order?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Link',
                      onPress: () =>
                        Alert.alert('Linked', `${selected.name} has been linked to the current order.`),
                    },
                  ],
                )
              }
            >
              <Ionicons name="add-circle-outline" size={18} color="#818cf8" />
              <Text style={styles.actionBtnText}>Add to Current Order</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnSecondary]}
              onPress={() =>
                Alert.alert(
                  'Redeem Points',
                  `${selected.name} has ${selected.points.toLocaleString()} points.\nPoint redemption will be available in a future update.`,
                )
              }
            >
              <Ionicons name="gift-outline" size={18} color="#fbbf24" />
              <Text style={[styles.actionBtnText, { color: '#fbbf24' }]}>Redeem Points</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color="#6b7280" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, email, or phone..."
            placeholderTextColor="#6b7280"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#6b7280" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listHeaderText}>{filtered.length} customers</Text>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {filtered.map((customer) => {
          const tc = tierConfig[customer.tier];
          return (
            <TouchableOpacity
              key={customer.id}
              style={styles.customerCard}
              onPress={() => setSelected(customer)}
              activeOpacity={0.75}
            >
              <View style={styles.customerAvatar}>
                <Text style={styles.customerAvatarText}>
                  {customer.name.split(' ').map((n) => n[0]).join('')}
                </Text>
              </View>
              <View style={styles.customerInfo}>
                <View style={styles.customerNameRow}>
                  <Text style={styles.customerName}>{customer.name}</Text>
                  <View style={[styles.tierPill, { backgroundColor: tc.bg }]}>
                    <Text style={[styles.tierPillText, { color: tc.text }]}>
                      {tc.icon} {customer.tier}
                    </Text>
                  </View>
                </View>
                <Text style={styles.customerEmail}>{customer.email}</Text>
                <View style={styles.customerMeta}>
                  <Ionicons name="star-outline" size={12} color="#6b7280" />
                  <Text style={styles.customerMetaText}>{customer.points.toLocaleString()} pts</Text>
                  <Text style={styles.customerMetaDot}>·</Text>
                  <Text style={styles.customerMetaText}>{customer.visits} visits</Text>
                  <Text style={styles.customerMetaDot}>·</Text>
                  <Text style={styles.customerMetaText}>{customer.lastVisit}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#4b5563" />
            </TouchableOpacity>
          );
        })}

        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={40} color="#374151" />
            <Text style={styles.emptyTitle}>No customers found</Text>
            <Text style={styles.emptySubtitle}>Try a different search term</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e2e' },

  // Search
  searchContainer: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a3a' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#2a2a3a', borderRadius: 10, paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 10 },

  listHeader: { paddingHorizontal: 16, paddingVertical: 8 },
  listHeaderText: { color: '#6b7280', fontSize: 12 },

  // List
  list: { flex: 1 },
  listContent: { padding: 12, gap: 8 },
  customerCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#16161f', borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: '#2a2a3a',
  },
  customerAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#3730a3', alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  customerAvatarText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  customerInfo: { flex: 1 },
  customerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  customerName: { color: '#fff', fontWeight: '600', fontSize: 14 },
  tierPill: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  tierPillText: { fontSize: 11, fontWeight: '600' },
  customerEmail: { color: '#6b7280', fontSize: 12, marginBottom: 4 },
  customerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  customerMetaText: { color: '#6b7280', fontSize: 11 },
  customerMetaDot: { color: '#4b5563', fontSize: 11 },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { color: '#4b5563', fontSize: 16, fontWeight: '600' },
  emptySubtitle: { color: '#374151', fontSize: 13 },

  // Detail view
  detailHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a3a',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { color: '#818cf8', fontSize: 15 },
  detailScroll: { flex: 1 },
  detailContent: { alignItems: 'center', padding: 24, gap: 12 },
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#3730a3', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  detailName: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  tierBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
  },
  tierIcon: { fontSize: 16 },
  tierLabel: { fontSize: 14, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row', backgroundColor: '#16161f',
    borderRadius: 16, padding: 16,
    width: '100%', borderWidth: 1, borderColor: '#2a2a3a',
    marginTop: 4,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  statLabel: { color: '#6b7280', fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: '#2a2a3a', marginHorizontal: 8 },
  infoSection: {
    width: '100%', backgroundColor: '#16161f',
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#2a2a3a', gap: 12,
  },
  infoSectionTitle: { color: '#9ca3af', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { color: '#d1d5db', fontSize: 14 },
  actionSection: { width: '100%', gap: 10 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#1e1e3a',
    borderRadius: 12, paddingVertical: 14, borderWidth: 1, borderColor: '#818cf8',
  },
  actionBtnSecondary: { borderColor: '#fbbf24', backgroundColor: '#1a1400' },
  actionBtnText: { color: '#818cf8', fontSize: 15, fontWeight: '600' },
});
