import React, { useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const ADMIN_PIN = '0000'; // Default admin PIN — should be configurable

interface ExternalApp {
  key: string;
  label: string;
  tagline: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  packageName: string;
}

const EXTERNAL_APPS: ExternalApp[] = [
  {
    key: 'pos',
    label: 'POS',
    tagline: 'Sell products, take payments',
    icon: 'cart',
    color: '#6366f1',
    packageName: 'com.au.elevatedpos.pos',
  },
  {
    key: 'kds',
    label: 'Kitchen Display',
    tagline: 'View and bump orders',
    icon: 'restaurant',
    color: '#f59e0b',
    packageName: 'com.au.elevatedpos.kds',
  },
  {
    key: 'kiosk',
    label: 'Self-Order Kiosk',
    tagline: 'Customer self-service',
    icon: 'tablet-portrait',
    color: '#06b6d4',
    packageName: 'com.au.elevatedpos.kiosk',
  },
];

interface DashboardFeature {
  key: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  route: string;
}

const DASHBOARD_FEATURES: DashboardFeature[] = [
  {
    key: 'reports',
    label: 'Reports',
    description: 'Sales, revenue, top products',
    icon: 'bar-chart',
    color: '#10b981',
    route: '/dashboard/reports',
  },
  {
    key: 'orders',
    label: 'Orders',
    description: 'Manage pending and past orders',
    icon: 'clipboard',
    color: '#8b5cf6',
    route: '/dashboard/orders',
  },
  {
    key: 'catalog',
    label: 'Catalog',
    description: 'Products, categories, pricing',
    icon: 'cube',
    color: '#f59e0b',
    route: '/dashboard/catalog',
  },
  {
    key: 'staff',
    label: 'Staff',
    description: 'Employees and schedules',
    icon: 'people',
    color: '#ef4444',
    route: '/dashboard/staff',
  },
  {
    key: 'customers',
    label: 'Customers',
    description: 'Customer database and loyalty',
    icon: 'person-circle',
    color: '#06b6d4',
    route: '/dashboard/customers',
  },
  {
    key: 'settings',
    label: 'Settings',
    description: 'Org, locations, integrations',
    icon: 'settings',
    color: '#94a3b8',
    route: '/dashboard/settings',
  },
];

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function DashboardHomeScreen() {
  const router = useRouter();

  // Hidden settings: 5-tap logo
  const [logoTaps, setLogoTaps] = useState(0);
  const [showPinModal, setShowPinModal] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleLogoTap() {
    const newCount = logoTaps + 1;
    setLogoTaps(newCount);
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => setLogoTaps(0), 3000);
    if (newCount >= 5) {
      setLogoTaps(0);
      setAdminPin('');
      setShowPinModal(true);
    }
  }

  function handlePinSubmit() {
    if (adminPin === ADMIN_PIN) {
      setShowPinModal(false);
      setShowSettings(true);
    } else {
      Alert.alert('Incorrect PIN', 'Please try again.');
      setAdminPin('');
    }
  }

  async function launchApp(app: ExternalApp) {
    if (Platform.OS !== 'android') {
      Alert.alert('Not Supported', 'External app launch is only available on Android.');
      return;
    }
    const intentUrl =
      `intent:#Intent;` +
      `action=android.intent.action.MAIN;` +
      `category=android.intent.category.LAUNCHER;` +
      `package=${app.packageName};` +
      `end`;
    try {
      await Linking.openURL(intentUrl);
    } catch {
      Alert.alert(
        `${app.label} Not Installed`,
        `The ${app.label} app doesn't appear to be installed on this device.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Play Store',
            onPress: () =>
              Linking.openURL(`market://details?id=${app.packageName}`).catch(() =>
                Linking.openURL(`https://play.google.com/store/apps/details?id=${app.packageName}`),
              ),
          },
          {
            text: 'Direct Download',
            onPress: () => Linking.openURL('https://elevatedpos.com.au/downloads'),
          },
        ],
      );
    }
  }

  function openWebDashboard() {
    router.push('/(dashboard)/web');
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right']}>
      {/* ── Top Bar ── */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={handleLogoTap} activeOpacity={0.8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={s.logoBadge}>
              <Text style={s.logoText}>E</Text>
            </View>
            <View>
              <Text style={s.topTitle}>ElevatedPOS</Text>
              <Text style={s.topSub}>Dashboard</Text>
            </View>
          </View>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={s.headerBtn} onPress={openWebDashboard} activeOpacity={0.85}>
            <Ionicons name="globe-outline" size={16} color="#ccc" />
            <Text style={s.headerBtnText}>Open Web</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── Hero: App Launcher ── */}
        <Text style={s.sectionTitle}>LAUNCH APP</Text>
        <Text style={s.sectionSub}>Tap to open your installed ElevatedPOS apps</Text>

        <View style={s.appGrid}>
          {EXTERNAL_APPS.map((app) => (
            <TouchableOpacity
              key={app.key}
              style={[s.appCard, { borderColor: `${app.color}55` }]}
              onPress={() => launchApp(app)}
              activeOpacity={0.85}
            >
              <View style={[s.appIconWrap, { backgroundColor: `${app.color}22` }]}>
                <Ionicons name={app.icon} size={36} color={app.color} />
              </View>
              <Text style={s.appLabel}>{app.label}</Text>
              <Text style={s.appTagline}>{app.tagline}</Text>
              <View style={[s.appLaunchBtn, { backgroundColor: app.color }]}>
                <Text style={s.appLaunchText}>LAUNCH</Text>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Quick Access — opens web dashboard to specific page ── */}
        <Text style={s.sectionTitle}>QUICK ACCESS</Text>
        <Text style={s.sectionSub}>Jump into the web dashboard</Text>

        <View style={s.featureGrid}>
          {DASHBOARD_FEATURES.map((feat) => (
            <TouchableOpacity
              key={feat.key}
              style={s.featureCard}
              onPress={openWebDashboard}
              activeOpacity={0.85}
            >
              <View style={[s.featIcon, { backgroundColor: `${feat.color}22` }]}>
                <Ionicons name={feat.icon} size={22} color={feat.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.featLabel}>{feat.label}</Text>
                <Text style={s.featDesc}>{feat.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#444" />
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Text style={s.footerText}>ElevatedPOS Dashboard v{APP_VERSION}</Text>
          <Text style={s.footerText}>Powered by ElevatedPOS</Text>
        </View>
      </ScrollView>

      {/* ── Admin PIN Modal (5-tap hidden settings) ── */}
      <Modal visible={showPinModal} transparent animationType="fade" onRequestClose={() => setShowPinModal(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setShowPinModal(false)}>
          <Pressable style={s.modalContent} onPress={() => {}}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 4 }}>Admin Access</Text>
            <Text style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>Enter admin PIN to access settings</Text>
            <TextInput
              style={s.pinInput}
              value={adminPin}
              onChangeText={setAdminPin}
              placeholder="PIN"
              placeholderTextColor="#444"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              autoFocus
              onSubmitEditing={handlePinSubmit}
            />
            <TouchableOpacity style={s.pinBtn} onPress={handlePinSubmit}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Unlock</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Settings Modal ── */}
      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { width: 420, maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#fff' }}>Settings</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>

            <View style={s.settCard}>
              <Text style={s.settLabel}>App</Text>
              <Text style={s.settValue}>ElevatedPOS Dashboard</Text>
            </View>
            <View style={s.settCard}>
              <Text style={s.settLabel}>Version</Text>
              <Text style={s.settValue}>{APP_VERSION}</Text>
            </View>
            <View style={s.settCard}>
              <Text style={s.settLabel}>Platform</Text>
              <Text style={s.settValue}>
                {Platform.OS} {Platform.Version}
              </Text>
            </View>

            <TouchableOpacity
              style={[s.settBtn, { backgroundColor: '#6366f1', marginTop: 16 }]}
              onPress={() => {
                setShowSettings(false);
                openWebDashboard();
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Open Web Dashboard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#0d0d14',
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#fff', fontWeight: '900', fontSize: 18 },
  topTitle: { fontSize: 17, fontWeight: '900', color: '#fff', letterSpacing: 0.3 },
  topSub: { fontSize: 11, color: '#888', fontWeight: '600' },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#141425',
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  headerBtnText: { color: '#ccc', fontSize: 12, fontWeight: '700' },

  // Scroll content
  scrollContent: { padding: 20, paddingBottom: 40 },

  // Section headings
  sectionTitle: {
    fontSize: 11,
    color: '#888',
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
    marginTop: 8,
  },
  sectionSub: { fontSize: 13, color: '#555', marginBottom: 14 },

  // App launcher grid
  appGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  appCard: {
    flex: 1,
    backgroundColor: '#141425',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    alignItems: 'center',
    minHeight: 180,
  },
  appIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  appLabel: { fontSize: 16, fontWeight: '900', color: '#fff', marginBottom: 4 },
  appTagline: { fontSize: 11, color: '#888', textAlign: 'center', marginBottom: 14 },
  appLaunchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  appLaunchText: { color: '#fff', fontWeight: '800', fontSize: 11, letterSpacing: 0.5 },

  // Feature grid (quick access)
  featureGrid: {
    gap: 10,
    marginBottom: 20,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#141425',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#1e1e2e',
  },
  featIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featLabel: { fontSize: 15, fontWeight: '800', color: '#fff' },
  featDesc: { fontSize: 12, color: '#666', marginTop: 2 },

  // Footer
  footer: { alignItems: 'center', marginTop: 10, gap: 2 },
  footerText: { fontSize: 11, color: '#444' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#1a1a2e', borderRadius: 20, padding: 24, width: 320, borderWidth: 1, borderColor: '#2a2a3a' },
  pinInput: {
    backgroundColor: '#0d0d14',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    marginBottom: 12,
  },
  pinBtn: { backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  settCard: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e1e2e' },
  settLabel: { color: '#888', fontSize: 13 },
  settValue: { color: '#ccc', fontSize: 13, fontWeight: '600' },
  settBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
});
