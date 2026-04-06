import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  Switch,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/auth';
import type { AutoLogoutMinutes } from '../../store/auth';

interface MenuRow {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  label: string;
  sublabel?: string;
  chevron?: boolean;
  danger?: boolean;
  toggle?: boolean;
}

type Section = {
  title: string;
  rows: MenuRow[];
};

const SECTIONS: Section[] = [
  {
    title: 'Operations',
    rows: [
      {
        id: 'quicksale',
        icon: 'flash-outline',
        iconColor: '#facc15',
        iconBg: '#422006',
        label: 'Quick Sale',
        sublabel: 'Custom amount, misc charges',
        chevron: true,
      },
      {
        id: 'giftcards',
        icon: 'gift-outline',
        iconColor: '#4ade80',
        iconBg: '#14532d',
        label: 'Gift Cards',
        sublabel: 'Check balance, issue, void',
        chevron: true,
      },
      {
        id: 'laybys',
        icon: 'calendar-outline',
        iconColor: '#a78bfa',
        iconBg: '#2e1065',
        label: 'Laybys',
        sublabel: 'Manage instalment plans',
        chevron: true,
      },
      {
        id: 'drawer',
        icon: 'cash-outline',
        iconColor: '#34d399',
        iconBg: '#064e3b',
        label: 'Cash Drawer',
        sublabel: 'Open or count drawer',
        chevron: true,
      },
      {
        id: 'clockin',
        icon: 'timer-outline',
        iconColor: '#60a5fa',
        iconBg: '#1e3a5f',
        label: 'Shift / Time Clock',
        sublabel: 'Clock in, clock out, breaks',
        chevron: true,
      },
      {
        id: 'eod',
        icon: 'document-text-outline',
        iconColor: '#fbbf24',
        iconBg: '#451a03',
        label: 'End of Day Report',
        sublabel: 'Close register & review sales',
        chevron: true,
      },
    ],
  },
  {
    title: 'Management',
    rows: [
      {
        id: 'reports',
        icon: 'bar-chart-outline',
        iconColor: '#a5b4fc',
        iconBg: '#1e1e3a',
        label: 'Reports',
        sublabel: 'Opens back-office dashboard',
        chevron: true,
      },
      {
        id: 'settings',
        icon: 'settings-outline',
        iconColor: '#94a3b8',
        iconBg: '#1f2937',
        label: 'Settings',
        sublabel: 'Device, receipt, hardware',
        chevron: true,
      },
      {
        id: 'discounts',
        icon: 'pricetag-outline',
        iconColor: '#fb923c',
        iconBg: '#431407',
        label: 'Discounts & Promos',
        chevron: true,
      },
    ],
  },
  {
    title: 'Preferences',
    rows: [
      {
        id: 'sound',
        icon: 'volume-high-outline',
        iconColor: '#f472b6',
        iconBg: '#4a1942',
        label: 'Order Chime',
        toggle: true,
      },
      {
        id: 'receipt',
        icon: 'receipt-outline',
        iconColor: '#34d399',
        iconBg: '#064e3b',
        label: 'Auto-print Receipts',
        toggle: true,
      },
      {
        id: 'autologout',
        icon: 'timer-outline',
        iconColor: '#f59e0b',
        iconBg: '#451a03',
        label: 'Auto-Logout Timer',
        sublabel: 'Lock screen after inactivity',
        chevron: true,
      },
    ],
  },
  {
    title: 'Account',
    rows: [
      {
        id: 'signout',
        icon: 'log-out-outline',
        iconColor: '#f87171',
        iconBg: '#3b1f1f',
        label: 'Sign Out',
        danger: true,
      },
    ],
  },
];

// ─── Auto-logout timeout options ─────────────────────────────────────────────

const AUTO_LOGOUT_OPTIONS: { label: string; value: AutoLogoutMinutes }[] = [
  { label: '5 minutes', value: 5 },
  { label: '10 minutes', value: 10 },
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '60 minutes', value: 60 },
  { label: 'Never', value: 0 },
];

function formatAutoLogout(minutes: AutoLogoutMinutes): string {
  if (minutes === 0) return 'Never';
  return `${minutes} min`;
}

export default function MoreScreen() {
  const router = useRouter();
  const employee = useAuthStore((s) => s.employee);
  const logout = useAuthStore((s) => s.logout);
  const autoLogoutMinutes = useAuthStore((s) => s.autoLogoutMinutes);
  const setAutoLogoutMinutes = useAuthStore((s) => s.setAutoLogoutMinutes);

  const [sound, setSound] = useState(true);
  const [autoReceipt, setAutoReceipt] = useState(false);
  const [autoLogoutModalVisible, setAutoLogoutModalVisible] = useState(false);

  const displayName = employee?.name ?? 'Staff';
  const displayRole =
    employee?.role
      ? employee.role.charAt(0).toUpperCase() + employee.role.slice(1)
      : 'Employee';
  const avatarLetters = displayName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  const handlePress = (id: string) => {
    switch (id) {
      case 'quicksale':
        router.push('/quick-sale');
        break;
      case 'giftcards':
        router.push('/gift-cards');
        break;
      case 'laybys':
        router.push('/laybys');
        break;
      case 'drawer':
        Alert.alert('Cash Drawer', 'Choose an action', [
          { text: 'Open Drawer', onPress: () => Alert.alert('Cash Drawer', 'Drawer opened') },
          { text: 'Count Drawer', onPress: () => Alert.alert('Cash Drawer', 'Opening count screen...') },
          { text: 'Cancel', style: 'cancel' },
        ]);
        break;
      case 'clockin':
        router.push('/shift');
        break;
      case 'eod':
        router.push('/eod');
        break;
      case 'reports':
        // TODO: Implement deep link to back-office dashboard
        Alert.alert('Reports', 'The back-office reporting dashboard is not yet available on this device. Please visit the web dashboard for detailed reports.');
        break;
      case 'settings':
        router.push('/settings');
        break;
      case 'discounts':
        // TODO: Implement discount management screen
        Alert.alert('Coming Soon', 'Discount and promotion management will be available in a future update.');
        break;
      case 'autologout':
        setAutoLogoutModalVisible(true);
        break;
      case 'signout':
        Alert.alert('Sign Out', `Sign out as ${displayName}?`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign Out',
            style: 'destructive',
            onPress: () => {
              logout();
              router.replace('/login');
            },
          },
        ]);
        break;
    }
  };

  const getToggleValue = (id: string) => {
    if (id === 'sound') return sound;
    if (id === 'receipt') return autoReceipt;
    return false;
  };

  const handleToggle = (id: string, value: boolean) => {
    if (id === 'sound') setSound(value);
    if (id === 'receipt') setAutoReceipt(value);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Staff info card */}
      <View style={styles.staffCard}>
        <View style={styles.staffAvatar}>
          <Text style={styles.staffAvatarText}>{avatarLetters}</Text>
        </View>
        <View style={styles.staffInfo}>
          <Text style={styles.staffName}>{displayName}</Text>
          <Text style={styles.staffRole}>{displayRole} · Terminal 1</Text>
        </View>
        <View style={[styles.clockBadge, styles.clockBadgeIn]}>
          <View style={[styles.clockDot, { backgroundColor: '#4ade80' }]} />
          <Text style={[styles.clockText, { color: '#4ade80' }]}>Terminal 1</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.rows.map((row, index) => {
                const sublabel = row.id === 'autologout'
                  ? `Lock after ${formatAutoLogout(autoLogoutMinutes)}`
                  : row.sublabel;
                return (
                  <View key={row.id}>
                    <TouchableOpacity
                      style={styles.row}
                      onPress={() => !row.toggle && handlePress(row.id)}
                      activeOpacity={row.toggle ? 1 : 0.7}
                    >
                      <View style={[styles.iconBox, { backgroundColor: row.iconBg }]}>
                        <Ionicons name={row.icon} size={18} color={row.iconColor} />
                      </View>
                      <View style={styles.rowContent}>
                        <Text style={[styles.rowLabel, row.danger && styles.rowLabelDanger]}>
                          {row.label}
                        </Text>
                        {sublabel ? (
                          <Text style={styles.rowSublabel}>{sublabel}</Text>
                        ) : null}
                      </View>
                      {row.toggle ? (
                        <Switch
                          value={getToggleValue(row.id)}
                          onValueChange={(v) => handleToggle(row.id, v)}
                          trackColor={{ false: '#374151', true: '#4f46e5' }}
                          thumbColor={getToggleValue(row.id) ? '#818cf8' : '#9ca3af'}
                        />
                      ) : row.chevron ? (
                        <Ionicons name="chevron-forward" size={16} color="#4b5563" />
                      ) : null}
                    </TouchableOpacity>
                    {index < section.rows.length - 1 && <View style={styles.rowDivider} />}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <Text style={styles.version}>ElevatedPOS v1.0.0 · Terminal 1</Text>
      </ScrollView>

      {/* Auto-Logout Timer Modal */}
      <Modal
        visible={autoLogoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAutoLogoutModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Auto-Logout Timer</Text>
              <TouchableOpacity onPress={() => setAutoLogoutModalVisible(false)}>
                <Ionicons name="close" size={22} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDescription}>
              Automatically lock the terminal after a period of inactivity.
            </Text>
            {AUTO_LOGOUT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.modalOption,
                  autoLogoutMinutes === option.value && styles.modalOptionActive,
                ]}
                onPress={() => {
                  setAutoLogoutMinutes(option.value);
                  setAutoLogoutModalVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    autoLogoutMinutes === option.value && styles.modalOptionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
                {autoLogoutMinutes === option.value && (
                  <Ionicons name="checkmark" size={18} color="#818cf8" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e2e' },

  staffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16161f',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3a',
    gap: 12,
  },
  staffAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffAvatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  staffInfo: { flex: 1 },
  staffName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  staffRole: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  clockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  clockBadgeIn: { backgroundColor: '#14532d' },
  clockBadgeOut: { backgroundColor: '#3b1f1f' },
  clockDot: { width: 6, height: 6, borderRadius: 3 },
  clockText: { fontSize: 12, fontWeight: '600' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 4, paddingBottom: 32 },

  section: { marginBottom: 16 },
  sectionTitle: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionCard: {
    backgroundColor: '#16161f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: { flex: 1 },
  rowLabel: { color: '#e5e7eb', fontSize: 15, fontWeight: '500' },
  rowLabelDanger: { color: '#f87171' },
  rowSublabel: { color: '#6b7280', fontSize: 12, marginTop: 1 },
  rowDivider: { height: 1, backgroundColor: '#2a2a3a', marginLeft: 60 },

  version: {
    textAlign: 'center',
    color: '#374151',
    fontSize: 12,
    marginTop: 8,
  },

  // ── Auto-logout modal ────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    backgroundColor: '#1e1e2e',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  modalDescription: { color: '#6b7280', fontSize: 13, marginBottom: 16 },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  modalOptionActive: {
    backgroundColor: '#2a2a3a',
  },
  modalOptionText: { color: '#d1d5db', fontSize: 15 },
  modalOptionTextActive: { color: '#818cf8', fontWeight: '600' },
});
