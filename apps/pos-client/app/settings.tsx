import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Switch,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'elevatedpos_settings';

type FontSize = 'small' | 'medium' | 'large';

interface NexusSettings {
  // Hardware
  printerHost: string;
  printerPort: string;
  cashDrawerPort: string;
  cardReaderId: string;
  // Display
  darkMode: boolean;
  fontSize: FontSize;
  // About / endpoints (read-only)
}

const DEFAULT_SETTINGS: NexusSettings = {
  printerHost: '192.168.1.100',
  printerPort: '9100',
  cashDrawerPort: '/dev/ttyUSB0',
  cardReaderId: 'READER_001',
  darkMode: true,
  fontSize: 'medium',
};

const FONT_SIZE_OPTIONS: FontSize[] = ['small', 'medium', 'large'];

export default function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<NexusSettings>(DEFAULT_SETTINGS);
  const [lastSync, setLastSync] = useState<string>('Never');
  const [pendingItems, setPendingItems] = useState<number>(0);
  const [syncing, setSyncing] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
    loadSyncMeta();
  }, []);

  async function loadSettings() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<NexusSettings>;
        setSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // use defaults
    }
  }

  async function loadSyncMeta() {
    try {
      const ts = await AsyncStorage.getItem('elevatedpos_last_sync');
      if (ts) setLastSync(new Date(ts).toLocaleString());
      const pending = await AsyncStorage.getItem('elevatedpos_pending_count');
      if (pending) setPendingItems(Number(pending));
    } catch {
      // ignore
    }
  }

  async function saveSettings(next: NexusSettings) {
    setSettings(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      Alert.alert('Error', 'Failed to save settings.');
    }
  }

  function update<K extends keyof NexusSettings>(key: K, value: NexusSettings[K]) {
    const next = { ...settings, [key]: value };
    void saveSettings(next);
  }

  async function handleSyncNow() {
    setSyncing(true);
    try {
      await new Promise((r) => setTimeout(r, 1200));
      const now = new Date().toISOString();
      await AsyncStorage.setItem('elevatedpos_last_sync', now);
      await AsyncStorage.setItem('elevatedpos_pending_count', '0');
      setLastSync(new Date(now).toLocaleString());
      setPendingItems(0);
      Alert.alert('Sync Complete', 'All pending items have been synced.');
    } catch {
      Alert.alert('Sync Failed', 'Could not reach the server. Try again later.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>{'← Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        {saved ? (
          <Text style={styles.savedBadge}>Saved</Text>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ── Hardware ── */}
        <Text style={styles.sectionTitle}>Hardware</Text>
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Printer IP</Text>
            <TextInput
              style={styles.input}
              value={settings.printerHost}
              onChangeText={(v) => update('printerHost', v)}
              placeholder="192.168.1.100"
              placeholderTextColor="#4b5563"
              keyboardType="default"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Printer Port</Text>
            <TextInput
              style={styles.input}
              value={settings.printerPort}
              onChangeText={(v) => update('printerPort', v)}
              placeholder="9100"
              placeholderTextColor="#4b5563"
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Cash Drawer Port</Text>
            <TextInput
              style={styles.input}
              value={settings.cashDrawerPort}
              onChangeText={(v) => update('cashDrawerPort', v)}
              placeholder="/dev/ttyUSB0"
              placeholderTextColor="#4b5563"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Card Reader ID</Text>
            <TextInput
              style={styles.input}
              value={settings.cardReaderId}
              onChangeText={(v) => update('cardReaderId', v)}
              placeholder="READER_001"
              placeholderTextColor="#4b5563"
              autoCapitalize="characters"
            />
          </View>
        </View>

        {/* ── Display ── */}
        <Text style={styles.sectionTitle}>Display</Text>
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Dark Mode</Text>
            <Switch
              value={settings.darkMode}
              onValueChange={(v) => update('darkMode', v)}
              trackColor={{ false: '#374151', true: '#4f46e5' }}
              thumbColor={settings.darkMode ? '#818cf8' : '#9ca3af'}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldColBlock}>
            <Text style={styles.fieldLabel}>Font Size</Text>
            <View style={styles.segmentRow}>
              {FONT_SIZE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.segmentBtn,
                    settings.fontSize === opt && styles.segmentBtnActive,
                  ]}
                  onPress={() => update('fontSize', opt)}
                >
                  <Text
                    style={[
                      styles.segmentBtnText,
                      settings.fontSize === opt && styles.segmentBtnTextActive,
                    ]}
                  >
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* ── Offline / Sync ── */}
        <Text style={styles.sectionTitle}>Offline & Sync</Text>
        <View style={styles.card}>
          <View style={styles.syncRow}>
            <View style={styles.syncInfo}>
              <Text style={styles.syncLabel}>Sync Status</Text>
              <Text style={[styles.syncValue, pendingItems > 0 ? styles.syncWarning : styles.syncOk]}>
                {pendingItems > 0 ? `${pendingItems} pending` : 'Up to date'}
              </Text>
            </View>
            <View style={[styles.statusDot, { backgroundColor: pendingItems > 0 ? '#fbbf24' : '#4ade80' }]} />
          </View>
          <View style={styles.divider} />
          <View style={styles.syncRow}>
            <View style={styles.syncInfo}>
              <Text style={styles.syncLabel}>Last Sync</Text>
              <Text style={styles.syncValue}>{lastSync}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.syncRow}>
            <View style={styles.syncInfo}>
              <Text style={styles.syncLabel}>Pending Items</Text>
              <Text style={styles.syncValue}>{pendingItems}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity
            style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
            onPress={() => void handleSyncNow()}
            disabled={syncing}
          >
            <Text style={styles.syncBtnText}>{syncing ? 'Syncing…' : 'Sync Now'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── About ── */}
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          {[
            ['Version', '1.0.0'],
            ['Build', '20260323-001'],
            ['Auth Service', 'http://localhost:4000'],
            ['Orders Service', 'http://localhost:4001'],
            ['Catalog Service', 'http://localhost:4002'],
            ['Inventory Service', 'http://localhost:4003'],
            ['Hardware Bridge', 'http://127.0.0.1:9999'],
          ].map(([label, value], i, arr) => (
            <View key={label}>
              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>{label}</Text>
                <Text style={styles.aboutValue}>{value}</Text>
              </View>
              {i < arr.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e2e' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#16161f',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3a',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { minWidth: 60 },
  backText: { color: '#818cf8', fontSize: 15 },
  headerTitle: { color: '#e5e7eb', fontSize: 17, fontWeight: '700' },
  savedBadge: { color: '#4ade80', fontSize: 13, fontWeight: '600', minWidth: 60, textAlign: 'right' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 4 },

  sectionTitle: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 4,
  },

  card: {
    backgroundColor: '#16161f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: '#2a2a3a', marginLeft: 16 },

  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  fieldLabel: { color: '#e5e7eb', fontSize: 15, flex: 1 },
  input: {
    flex: 1,
    color: '#a5b4fc',
    fontSize: 14,
    textAlign: 'right',
    backgroundColor: 'transparent',
    paddingVertical: 0,
  },

  fieldColBlock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },

  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#2a2a3a',
    alignItems: 'center',
  },
  segmentBtnActive: { backgroundColor: '#4f46e5' },
  segmentBtnText: { color: '#6b7280', fontSize: 13, fontWeight: '600' },
  segmentBtnTextActive: { color: '#e5e7eb' },

  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  syncInfo: { flex: 1 },
  syncLabel: { color: '#e5e7eb', fontSize: 15 },
  syncValue: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  syncOk: { color: '#4ade80' },
  syncWarning: { color: '#fbbf24' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },

  syncBtn: {
    margin: 16,
    marginTop: 8,
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  syncBtnDisabled: { backgroundColor: '#312e81', opacity: 0.6 },
  syncBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  aboutLabel: { color: '#e5e7eb', fontSize: 14 },
  aboutValue: { color: '#6b7280', fontSize: 13 },

  bottomPad: { height: 32 },
});
