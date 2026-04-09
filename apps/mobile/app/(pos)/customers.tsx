import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDeviceStore } from '../../store/device';
import { useAuthStore } from '../../store/auth';
import { usePosStore } from '../../store/pos';

const API_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  loyaltyTier?: string;
  totalSpent?: number;
  visitCount?: number;
}

export default function CustomersScreen() {
  const identity = useDeviceStore((s) => s.identity);
  const employeeToken = useAuthStore((s) => s.employeeToken);
  const setCustomer = usePosStore((s) => s.setCustomer);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const token = employeeToken ?? identity?.deviceToken ?? '';
    try {
      const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : '';
      const res = await fetch(`${API_BASE}/api/v1/customers?limit=50${q}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.data ?? []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [employeeToken, identity, search]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  function handleSelect(c: Customer) {
    setCustomer(c.id, `${c.firstName} ${c.lastName}`);
    Alert.alert('Customer Selected', `${c.firstName} ${c.lastName} attached to the current order.`);
  }

  function renderCustomer({ item }: { item: Customer }) {
    return (
      <TouchableOpacity style={s.card} onPress={() => handleSelect(item)} activeOpacity={0.7}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>
            {item.firstName.charAt(0)}{item.lastName.charAt(0)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{item.firstName} {item.lastName}</Text>
          <Text style={s.sub}>
            {item.email ?? item.phone ?? 'No contact info'}
            {item.loyaltyTier ? ` · ${item.loyaltyTier}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {item.visitCount != null && (
            <Text style={s.visits}>{item.visitCount} visits</Text>
          )}
          <Ionicons name="add-circle-outline" size={22} color="#6366f1" />
        </View>
      </TouchableOpacity>
    );
  }

  async function handleAddCustomer() {
    if (!newFirst.trim()) { Alert.alert('Required', 'First name is required.'); return; }
    setSaving(true);
    const token = employeeToken ?? identity?.deviceToken ?? '';
    try {
      const res = await fetch(`${API_BASE}/api/v1/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ firstName: newFirst.trim(), lastName: newLast.trim(), email: newEmail.trim() || undefined, phone: newPhone.trim() || undefined }),
      });
      if (res.ok) {
        setShowAdd(false);
        setNewFirst(''); setNewLast(''); setNewEmail(''); setNewPhone('');
        fetchCustomers();
        Alert.alert('Customer Added', `${newFirst} ${newLast} has been added.`);
      } else {
        Alert.alert('Error', `Could not add customer (${res.status})`);
      }
    } catch { Alert.alert('Error', 'Network error'); }
    finally { setSaving(false); }
  }

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <View style={s.header}>
        <Text style={s.title}>Customers</Text>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#6366f1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}
          onPress={() => setShowAdd(true)}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Add</Text>
        </TouchableOpacity>
      </View>
      <View style={s.searchWrap}>
        <Ionicons name="search" size={16} color="#555" style={{ marginLeft: 12 }} />
        <TextInput
          style={s.searchInput}
          placeholder="Search customers..."
          placeholderTextColor="#444"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>

      {loading && customers.length === 0 ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : customers.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="people-outline" size={36} color="#444" />
          <Text style={s.emptyText}>{search ? 'No matching customers' : 'No customers yet'}</Text>
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(c) => c.id}
          renderItem={renderCustomer}
          contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
          refreshing={loading}
          onRefresh={fetchCustomers}
        />
      )}
      {/* Add Customer Modal */}
      <Modal visible={showAdd} transparent animationType="fade" onRequestClose={() => setShowAdd(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setShowAdd(false)}>
          <Pressable style={{ backgroundColor: '#1a1a2e', borderRadius: 20, padding: 24, width: 360, borderWidth: 1, borderColor: '#2a2a3a' }} onPress={() => {}}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 16 }}>Add Customer</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <TextInput style={[s.addInput, { flex: 1 }]} value={newFirst} onChangeText={setNewFirst} placeholder="First Name *" placeholderTextColor="#555" />
              <TextInput style={[s.addInput, { flex: 1 }]} value={newLast} onChangeText={setNewLast} placeholder="Last Name" placeholderTextColor="#555" />
            </View>
            <TextInput style={[s.addInput, { marginBottom: 10 }]} value={newEmail} onChangeText={setNewEmail} placeholder="Email" placeholderTextColor="#555" keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={[s.addInput, { marginBottom: 16 }]} value={newPhone} onChangeText={setNewPhone} placeholder="Phone" placeholderTextColor="#555" keyboardType="phone-pad" />
            <TouchableOpacity
              style={{ backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
              onPress={handleAddCustomer}
              disabled={saving}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{saving ? 'Saving...' : 'Add Customer'}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e1e2e' },
  title: { fontSize: 20, fontWeight: '900', color: '#fff' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141425', marginHorizontal: 12, marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: '#2a2a3a', height: 40 },
  searchInput: { flex: 1, color: '#ccc', fontSize: 14, paddingHorizontal: 10, height: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: '#555', fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141425', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#2a2a3a', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#6366f120', borderWidth: 1, borderColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#6366f1', fontWeight: '800', fontSize: 14 },
  name: { fontSize: 15, fontWeight: '700', color: '#fff' },
  sub: { fontSize: 12, color: '#888', marginTop: 2 },
  visits: { fontSize: 11, color: '#666', marginBottom: 4 },
  addInput: { backgroundColor: '#0d0d14', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#fff', borderWidth: 1, borderColor: '#2a2a3a' },
});
