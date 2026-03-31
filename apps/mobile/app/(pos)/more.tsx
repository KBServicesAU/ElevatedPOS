import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useDeviceStore } from '../../store/device';

export default function MoreScreen() {
  const router = useRouter();
  const { identity, clearIdentity } = useDeviceStore();

  function handleUnpair() {
    Alert.alert(
      'Unpair Device',
      'This will remove all device credentials. You will need to pair again to use this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpair',
          style: 'destructive',
          onPress: async () => {
            await clearIdentity();
            router.replace('/pair');
          },
        },
      ],
    );
  }

  function truncate(str: string | null | undefined, len = 16): string {
    if (!str) return '—';
    return str.length > len ? `${str.slice(0, len)}...` : str;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Device Info</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Role</Text>
            <View style={[styles.roleBadge, identity?.role === 'pos' ? styles.rolePOS : null]}>
              <Text style={styles.roleBadgeText}>{identity?.role?.toUpperCase() ?? '—'}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Label</Text>
            <Text style={styles.value}>{identity?.label ?? '—'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Location ID</Text>
            <Text style={styles.value}>{truncate(identity?.locationId)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Device ID</Text>
            <Text style={styles.value}>{truncate(identity?.deviceId)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Register ID</Text>
            <Text style={styles.value}>{truncate(identity?.registerId)}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.unpairBtn} onPress={handleUnpair} activeOpacity={0.85}>
          <Text style={styles.unpairBtnText}>Unpair Device</Text>
        </TouchableOpacity>

        <Text style={styles.warning}>
          Unpairing will require a new pairing code from the back-office.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  content: { flex: 1, padding: 24 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 16 },
  card: { backgroundColor: '#141425', borderRadius: 16, borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  divider: { height: 1, backgroundColor: '#1e1e2e', marginHorizontal: 16 },
  label: { fontSize: 14, color: '#777' },
  value: { fontSize: 14, color: '#ccc', fontWeight: '500' },
  roleBadge: { backgroundColor: '#2a2a3a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  rolePOS: { backgroundColor: 'rgba(99,102,241,0.2)', borderWidth: 1, borderColor: '#6366f1' },
  roleBadgeText: { fontSize: 13, fontWeight: '800', color: '#6366f1' },
  unpairBtn: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ef4444',
    marginBottom: 12,
  },
  unpairBtnText: { fontSize: 16, fontWeight: '700', color: '#ef4444' },
  warning: { fontSize: 13, color: '#555', textAlign: 'center', lineHeight: 18 },
});
