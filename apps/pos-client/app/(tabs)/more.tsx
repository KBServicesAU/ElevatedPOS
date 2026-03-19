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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
        id: 'drawer',
        icon: 'cash-outline',
        iconColor: '#4ade80',
        iconBg: '#14532d',
        label: 'Cash Drawer',
        sublabel: 'Open or count drawer',
        chevron: true,
      },
      {
        id: 'clockin',
        icon: 'timer-outline',
        iconColor: '#60a5fa',
        iconBg: '#1e3a5f',
        label: 'Clock In / Out',
        sublabel: 'Clocked in since 9:00 AM',
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
        sublabel: 'Device, receipt, tax settings',
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

export default function MoreScreen() {
  const [sound, setSound] = useState(true);
  const [autoReceipt, setAutoReceipt] = useState(false);
  const [clockedIn, setClockedIn] = useState(true);

  const handlePress = (id: string) => {
    switch (id) {
      case 'drawer':
        Alert.alert('Cash Drawer', 'Choose an action', [
          { text: 'Open Drawer', onPress: () => Alert.alert('Cash Drawer', 'Drawer opened') },
          { text: 'Count Drawer', onPress: () => Alert.alert('Cash Drawer', 'Opening count screen...') },
          { text: 'Cancel', style: 'cancel' },
        ]);
        break;
      case 'clockin':
        Alert.alert(
          clockedIn ? 'Clock Out' : 'Clock In',
          clockedIn ? 'End your shift at 10:52 AM?' : 'Start your shift now?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: clockedIn ? 'Clock Out' : 'Clock In',
              onPress: () => {
                setClockedIn((v) => !v);
                Alert.alert('Done', clockedIn ? 'Clocked out successfully' : 'Clocked in successfully');
              },
            },
          ]
        );
        break;
      case 'reports':
        Alert.alert('Reports', 'This would open the back-office dashboard at port 3000.');
        break;
      case 'settings':
        Alert.alert('Settings', 'Device settings coming soon.');
        break;
      case 'discounts':
        Alert.alert('Discounts', 'Discount management coming soon.');
        break;
      case 'signout':
        Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: () => Alert.alert('Signed out') },
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
          <Text style={styles.staffAvatarText}>AW</Text>
        </View>
        <View style={styles.staffInfo}>
          <Text style={styles.staffName}>Alex Williams</Text>
          <Text style={styles.staffRole}>Barista · Terminal 1</Text>
        </View>
        <View style={[styles.clockBadge, clockedIn ? styles.clockBadgeIn : styles.clockBadgeOut]}>
          <View style={[styles.clockDot, { backgroundColor: clockedIn ? '#4ade80' : '#f87171' }]} />
          <Text style={[styles.clockText, { color: clockedIn ? '#4ade80' : '#f87171' }]}>
            {clockedIn ? 'On Shift' : 'Off Shift'}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.rows.map((row, index) => {
                const sublabel =
                  row.id === 'clockin'
                    ? clockedIn ? 'Clocked in since 9:00 AM' : 'Not clocked in'
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

        <Text style={styles.version}>NEXUS POS v1.0.0 · Terminal 1</Text>
      </ScrollView>
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
});
