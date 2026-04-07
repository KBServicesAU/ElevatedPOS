import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useDeviceStore } from '../../store/device';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const DOWNLOADS_API =
  process.env['EXPO_PUBLIC_STOREFRONT_URL']
    ? `${process.env['EXPO_PUBLIC_STOREFRONT_URL'].replace(/\/+$/, '')}/api/downloads/latest`
    : 'https://elevatedpos.com.au/api/downloads/latest';

const APP_TILES = [
  {
    key: 'pos' as const,
    name: 'Point of Sale',
    description: 'Process orders, manage cart, and accept payments',
    icon: 'cart' as const,
    color: '#6366f1',
    route: '/(pos)' as const,
    packageName: 'com.au.elevatedpos.pos',
  },
  {
    key: 'kds' as const,
    name: 'Kitchen Display',
    description: 'Real-time order tickets, timers, and bump bar',
    icon: 'restaurant' as const,
    color: '#f59e0b',
    route: '/(kds)' as const,
    packageName: 'com.au.elevatedpos.kds',
  },
  {
    key: 'kiosk' as const,
    name: 'Self-Service Kiosk',
    description: 'Customer-facing ordering with menu browsing',
    icon: 'tablet-portrait' as const,
    color: '#06b6d4',
    route: '/(kiosk)/attract' as const,
    packageName: 'com.au.elevatedpos.kiosk',
  },
] as const;

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function DashboardHomeScreen() {
  const router = useRouter();
  const { identity, clearIdentity } = useDeviceStore();

  // Stats state
  const [ordersToday, setOrdersToday] = useState<number | null>(null);
  const [revenueToday, setRevenueToday] = useState<number | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [latestVersions, setLatestVersions] = useState<Record<string, string>>({});

  // Fetch quick stats on mount
  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    setLoadingStats(true);
    try {
      const base = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(
        `${base}/api/v1/orders?dateFrom=${today}&limit=1`,
        {
          headers: identity
            ? { Authorization: `Bearer ${identity.deviceToken}` }
            : {},
        },
      );
      if (res.ok) {
        const data = await res.json() as {
          meta?: { totalCount?: number };
          data?: { total?: number }[];
        };
        const count = data.meta?.totalCount ?? data.data?.length ?? 0;
        setOrdersToday(count);
        // Estimate revenue from first page
        const rev =
          data.data?.reduce((s, o) => s + (o.total ?? 0), 0) ?? 0;
        setRevenueToday(rev);
      }
    } catch {
      // Stats unavailable — non-critical
    } finally {
      setLoadingStats(false);
    }
  }

  async function checkAllUpdates() {
    setUpdateChecking(true);
    try {
      const results: Record<string, string> = {};
      for (const app of ['pos', 'kds', 'kiosk']) {
        try {
          const res = await fetch(`${DOWNLOADS_API}?app=${app}`);
          if (res.ok) {
            const data = (await res.json()) as { version?: string };
            if (data.version) results[app] = data.version;
          }
        } catch {
          // skip
        }
      }
      setLatestVersions(results);
    } finally {
      setUpdateChecking(false);
    }
  }

  function handleOpenApp(tile: (typeof APP_TILES)[number]) {
    // Navigate within the same app to the role's route group
    router.push(tile.route);
  }

  function handleUnpair() {
    Alert.alert(
      'Unpair Device',
      'This will remove all device credentials. You will need to pair again.',
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

  const greeting = getGreeting();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.headerTitle}>ElevatedPOS</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => {
              setShowSettings(!showSettings);
              if (!showSettings) checkAllUpdates();
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="settings-outline" size={22} color="#888" />
          </TouchableOpacity>
        </View>

        {/* ── Device Info Bar ── */}
        <View style={styles.deviceBar}>
          <View style={styles.deviceBarItem}>
            <Ionicons name="location-outline" size={14} color="#666" />
            <Text style={styles.deviceBarText}>
              {identity?.label ?? truncate(identity?.locationId, 12) ?? 'Unknown'}
            </Text>
          </View>
          <View style={styles.deviceBarDot} />
          <Text style={styles.deviceBarText}>v{APP_VERSION}</Text>
        </View>

        {/* ── App Tiles ── */}
        <Text style={styles.sectionTitle}>Applications</Text>

        <View style={styles.tilesRow}>
          {APP_TILES.map((tile) => (
            <TouchableOpacity
              key={tile.key}
              style={[styles.tile, { borderColor: `${tile.color}40` }]}
              onPress={() => handleOpenApp(tile)}
              activeOpacity={0.8}
            >
              <View
                style={[styles.tileIconWrap, { backgroundColor: `${tile.color}18` }]}
              >
                <Ionicons name={tile.icon} size={32} color={tile.color} />
              </View>
              <Text style={styles.tileName}>{tile.name}</Text>
              <Text style={styles.tileDesc} numberOfLines={2}>
                {tile.description}
              </Text>
              <View style={[styles.tileArrow, { backgroundColor: tile.color }]}>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Quick Stats ── */}
        <Text style={styles.sectionTitle}>Today&apos;s Overview</Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="receipt-outline" size={22} color="#6366f1" />
            <Text style={styles.statValue}>
              {loadingStats ? '—' : (ordersToday ?? '—')}
            </Text>
            <Text style={styles.statLabel}>Orders</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="cash-outline" size={22} color="#10b981" />
            <Text style={styles.statValue}>
              {loadingStats
                ? '—'
                : revenueToday != null
                  ? `$${revenueToday.toFixed(0)}`
                  : '—'}
            </Text>
            <Text style={styles.statLabel}>Revenue</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="refresh" size={22} color="#f59e0b" />
            <TouchableOpacity onPress={fetchStats} disabled={loadingStats}>
              {loadingStats ? (
                <ActivityIndicator
                  size="small"
                  color="#f59e0b"
                  style={{ marginTop: 4 }}
                />
              ) : (
                <Text style={[styles.statValue, { color: '#f59e0b' }]}>
                  Refresh
                </Text>
              )}
            </TouchableOpacity>
            <Text style={styles.statLabel}>Stats</Text>
          </View>
        </View>

        {/* ── Settings Panel (toggle) ── */}
        {showSettings && (
          <View style={styles.settingsPanel}>
            <Text style={styles.settingsPanelTitle}>App Versions</Text>
            {updateChecking ? (
              <ActivityIndicator
                size="small"
                color="#6366f1"
                style={{ marginVertical: 12 }}
              />
            ) : (
              APP_TILES.map((tile) => (
                <View key={tile.key} style={styles.versionRow}>
                  <Text style={styles.versionApp}>{tile.name}</Text>
                  <Text style={styles.versionNum}>
                    {latestVersions[tile.key] ?? '—'}
                  </Text>
                </View>
              ))
            )}

            <View style={styles.settingsDivider} />

            <View style={styles.versionRow}>
              <Text style={styles.versionApp}>Device ID</Text>
              <Text style={styles.versionNum}>
                {truncate(identity?.deviceId, 14)}
              </Text>
            </View>
            <View style={styles.versionRow}>
              <Text style={styles.versionApp}>Org ID</Text>
              <Text style={styles.versionNum}>
                {truncate(identity?.orgId, 14)}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.unpairBtn}
              onPress={handleUnpair}
              activeOpacity={0.85}
            >
              <Text style={styles.unpairText}>Unpair Device</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function truncate(str: string | null | undefined, len = 16): string {
  if (!str) return '—';
  return str.length > len ? `${str.slice(0, len)}...` : str;
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  scroll: { flex: 1 },
  scrollContent: { padding: 24 },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  greeting: { fontSize: 14, color: '#666', fontWeight: '500', marginBottom: 2 },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#141425',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },

  /* ── Device bar ── */
  deviceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 28,
    marginTop: 4,
  },
  deviceBarItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deviceBarText: { fontSize: 12, color: '#555', fontWeight: '500' },
  deviceBarDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
  },

  /* ── Section ── */
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 14,
  },

  /* ── App Tiles ── */
  tilesRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  tile: {
    flex: 1,
    backgroundColor: '#141425',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    minHeight: 180,
    justifyContent: 'space-between',
  },
  tileIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  tileName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  tileDesc: {
    fontSize: 11,
    color: '#666',
    lineHeight: 16,
    marginBottom: 12,
  },
  tileArrow: {
    alignSelf: 'flex-end',
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Stats ── */
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#141425',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: '#555',
    fontWeight: '500',
  },

  /* ── Settings Panel ── */
  settingsPanel: {
    backgroundColor: '#141425',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    padding: 18,
    marginBottom: 16,
  },
  settingsPanelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  versionApp: { fontSize: 14, color: '#888' },
  versionNum: { fontSize: 14, color: '#ccc', fontWeight: '600' },
  settingsDivider: {
    height: 1,
    backgroundColor: '#1e1e2e',
    marginVertical: 10,
  },
  unpairBtn: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  unpairText: { fontSize: 14, fontWeight: '700', color: '#ef4444' },
});
