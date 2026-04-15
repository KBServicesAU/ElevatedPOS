import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import * as SecureStore from 'expo-secure-store';
import { useDeviceStore } from '../../store/device';
import { useDashboardAuthStore } from '../../store/dashboard-auth';
import { toast, confirm } from '../../components/ui';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const SECURE_STORE_PIN_KEY = 'admin_pin';

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
  {
    key: 'card-readers',
    label: 'Card Readers',
    description: 'Pair readers, order hardware',
    icon: 'card',
    color: '#6366f1',
    route: '/dashboard/payments?tab=hardware',
  },
  {
    key: 'elevatedpay',
    label: 'ElevatedPOS Pay',
    description: 'Payouts, balance, compliance',
    icon: 'wallet',
    color: '#10b981',
    route: '/dashboard/payments?tab=elevatedpay',
  },
];

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

interface DashboardStats {
  salesToday: number;
  ordersToday: number;
  pendingOrders: number;
  topProduct: string | null;
  // Period-over-period comparison values
  salesYesterday: number;
  ordersYesterday: number;
  salesThisWeek: number;
  salesLastWeek: number;
  ordersThisWeek: number;
  ordersLastWeek: number;
}

const EMPTY_STATS: DashboardStats = {
  salesToday: 0,
  ordersToday: 0,
  pendingOrders: 0,
  topProduct: null,
  salesYesterday: 0,
  ordersYesterday: 0,
  salesThisWeek: 0,
  salesLastWeek: 0,
  ordersThisWeek: 0,
  ordersLastWeek: 0,
};

const API_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';

/** Format a delta as "+12%" / "-5%" / "—". */
function formatDelta(current: number, previous: number): {
  text: string;
  positive: boolean;
  zero: boolean;
} {
  if (previous === 0) {
    return current === 0
      ? { text: '—', positive: true, zero: true }
      : { text: 'NEW', positive: true, zero: false };
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct);
  if (rounded === 0) return { text: '0%', positive: true, zero: true };
  return {
    text: `${rounded > 0 ? '+' : ''}${rounded}%`,
    positive: rounded >= 0,
    zero: false,
  };
}

/** Build start/end ISO strings for today, yesterday, this week, last week. */
function getPeriodRanges() {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  // Week starts Monday (locale-friendly for AU)
  const day = startOfToday.getDay(); // 0 = Sun .. 6 = Sat
  const isoOffset = (day + 6) % 7; // Mon = 0
  const startOfThisWeek = new Date(startOfToday);
  startOfThisWeek.setDate(startOfThisWeek.getDate() - isoOffset);
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
  return {
    startOfToday,
    startOfYesterday,
    startOfThisWeek,
    startOfLastWeek,
  };
}

export default function DashboardHomeScreen() {
  const router = useRouter();
  const identity = useDeviceStore((s) => s.identity);
  const checkHeartbeat = useDeviceStore((s) => s.checkHeartbeat);

  // Hidden settings: 5-tap logo
  const [logoTaps, setLogoTaps] = useState(0);
  const [showPinModal, setShowPinModal] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [storedPin, setStoredPin] = useState('0000');
  const [showSettings, setShowSettings] = useState(false);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Change PIN state (inside settings modal)
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [newPinValue, setNewPinValue] = useState('');
  const [confirmPinValue, setConfirmPinValue] = useState('');

  // Native stats for the home screen
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Dashboard SSO credentials
  const dashboardAuth = useDashboardAuthStore();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (!dashboardAuth.ready) dashboardAuth.hydrate();
  }, [dashboardAuth.ready]);

  // Load admin PIN from SecureStore on mount. If none is stored yet,
  // write the default '0000' so future reads are consistent.
  useEffect(() => {
    SecureStore.getItemAsync(SECURE_STORE_PIN_KEY).then((stored) => {
      if (stored) {
        setStoredPin(stored);
      } else {
        SecureStore.setItemAsync(SECURE_STORE_PIN_KEY, '0000').catch(() => {});
        setStoredPin('0000');
      }
    }).catch(() => {
      // SecureStore unavailable — fall back to default
      setStoredPin('0000');
    });
  }, []);

  const fetchStats = async () => {
    if (!identity) return;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/reports/today?locationId=${identity.locationId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${identity.deviceToken}`,
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      let baseStats = { ...EMPTY_STATS };
      if (res.ok) {
        const data = await res.json();
        baseStats = {
          ...EMPTY_STATS,
          salesToday: Number(data.salesToday ?? 0),
          ordersToday: Number(data.ordersToday ?? 0),
          pendingOrders: Number(data.pendingOrders ?? 0),
          topProduct: data.topProduct ?? null,
          // Server may already include comparison fields — use them if present
          salesYesterday: Number(data.salesYesterday ?? 0),
          ordersYesterday: Number(data.ordersYesterday ?? 0),
          salesThisWeek: Number(data.salesThisWeek ?? 0),
          salesLastWeek: Number(data.salesLastWeek ?? 0),
          ordersThisWeek: Number(data.ordersThisWeek ?? 0),
          ordersLastWeek: Number(data.ordersLastWeek ?? 0),
        };
      } else {
        setStatsError('Could not load stats');
      }

      // If the server didn't supply comparison data, derive it from raw orders
      if (
        baseStats.salesYesterday === 0 &&
        baseStats.salesLastWeek === 0
      ) {
        try {
          const periodStats = await fetchPeriodStatsFromOrders();
          if (periodStats) {
            baseStats = { ...baseStats, ...periodStats };
          }
        } catch {
          /* fall through — leave zeros */
        }
      }

      setStats(baseStats);
    } catch {
      setStatsError('Offline');
    } finally {
      setStatsLoading(false);
    }
  };

  /**
   * Fallback period aggregation: pull the orders list and bucket each one
   * into today / yesterday / this-week / last-week. Used when the dedicated
   * `/reports/today` endpoint doesn't already include comparison numbers.
   */
  async function fetchPeriodStatsFromOrders(): Promise<Partial<DashboardStats> | null> {
    if (!identity) return null;
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/orders?limit=1000&locationId=${identity.locationId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${identity.deviceToken}`,
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!res.ok) return null;
      const json = await res.json();
      const list: any[] = Array.isArray(json) ? json : (json?.data ?? []);
      const ranges = getPeriodRanges();

      let salesYesterday = 0;
      let ordersYesterday = 0;
      let salesThisWeek = 0;
      let salesLastWeek = 0;
      let ordersThisWeek = 0;
      let ordersLastWeek = 0;

      for (const order of list) {
        const created = new Date(order.createdAt);
        if (isNaN(created.getTime())) continue;
        const status = String(order.status ?? '').toLowerCase();
        if (status !== 'completed' && status !== 'paid') continue;
        const total = Number(order.total ?? 0);

        // Yesterday
        if (created >= ranges.startOfYesterday && created < ranges.startOfToday) {
          salesYesterday += total;
          ordersYesterday += 1;
        }
        // This week (Mon → now)
        if (created >= ranges.startOfThisWeek) {
          salesThisWeek += total;
          ordersThisWeek += 1;
        }
        // Last week (prev Mon → prev Sun)
        if (
          created >= ranges.startOfLastWeek &&
          created < ranges.startOfThisWeek
        ) {
          salesLastWeek += total;
          ordersLastWeek += 1;
        }
      }

      return {
        salesYesterday,
        ordersYesterday,
        salesThisWeek,
        salesLastWeek,
        ordersThisWeek,
        ordersLastWeek,
      };
    } catch {
      return null;
    }
  }

  // Device heartbeat / revocation is handled globally by app/_layout.tsx.
  // We do NOT duplicate it here — two concurrent router.replace('/pair') calls
  // racing on the same navigation event cause a black screen in Expo Router.

  // Fetch stats on mount and then every 2 minutes
  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 120_000);
    return () => clearInterval(interval);
  }, [identity?.deviceToken]);

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
    if (adminPin === storedPin) {
      setShowPinModal(false);
      setShowSettings(true);
    } else {
      toast.error('Incorrect PIN', 'Please try again.');
      setAdminPin('');
    }
  }

  async function handleSaveNewPin() {
    const trimmed = newPinValue.trim();
    if (trimmed.length < 4 || trimmed.length > 6 || !/^\d+$/.test(trimmed)) {
      toast.warning('Invalid PIN', 'PIN must be 4–6 digits.');
      return;
    }
    if (trimmed !== confirmPinValue.trim()) {
      toast.warning('PIN Mismatch', 'The two PINs you entered do not match.');
      return;
    }
    try {
      await SecureStore.setItemAsync(SECURE_STORE_PIN_KEY, trimmed);
      setStoredPin(trimmed);
      setNewPinValue('');
      setConfirmPinValue('');
      setShowChangePinModal(false);
      toast.success('PIN Updated', 'Admin PIN has been changed.');
    } catch {
      toast.error('Error', 'Could not save PIN. Please try again.');
    }
  }

  async function launchApp(app: ExternalApp) {
    if (Platform.OS !== 'android') {
      toast.warning('Not Supported', 'External app launch is only available on Android.');
      return;
    }
    // Use the Android intent URL with S.browser_fallback_url so the system
    // automatically opens the Play Store (or our downloads page) if the
    // target app is not installed. This is far more reliable than relying
    // on Linking.openURL() throwing — Android intent URLs rarely surface
    // errors for missing packages.
    const fallbackUrl = encodeURIComponent(
      `https://elevatedpos.com.au/downloads?app=${app.key}`,
    );
    const intentUrl =
      `intent:#Intent;` +
      `action=android.intent.action.MAIN;` +
      `category=android.intent.category.LAUNCHER;` +
      `package=${app.packageName};` +
      `S.browser_fallback_url=${fallbackUrl};` +
      `end`;
    try {
      const supported = await Linking.canOpenURL(intentUrl);
      if (!supported) {
        // Fall back to direct market URL or downloads page
        const marketUrl = `market://details?id=${app.packageName}`;
        await Linking.openURL(marketUrl).catch(() =>
          Linking.openURL(`https://play.google.com/store/apps/details?id=${app.packageName}`),
        );
        return;
      }
      await Linking.openURL(intentUrl);
    } catch {
      // Belt-and-braces fallback: ask the user where they'd like to install
      const ok = await confirm({
        title: `${app.label} Not Installed`,
        description: `Could not launch ${app.label}. Would you like to install it from the Play Store?`,
        confirmLabel: 'Open Play Store',
        cancelLabel: 'Cancel',
      });
      if (ok) {
        Linking.openURL(`market://details?id=${app.packageName}`).catch(() =>
          Linking.openURL(`https://play.google.com/store/apps/details?id=${app.packageName}`),
        );
      }
    }
  }

  async function openWebDashboard(path?: string) {
    // No refresh token stored yet — ask the user to sign in once
    if (!dashboardAuth.refreshToken) {
      setLoginEmail(dashboardAuth.email ?? '');
      setLoginPassword('');
      setShowLoginModal(true);
      return;
    }
    // Exchange stored refresh token for a fresh access token silently
    const accessToken = await dashboardAuth.getValidToken(API_BASE);
    if (!accessToken) {
      // Refresh token expired — clear and ask to re-authenticate
      await dashboardAuth.clear();
      setLoginEmail(dashboardAuth.email ?? '');
      setLoginPassword('');
      setShowLoginModal(true);
      return;
    }
    const tokenParam = `token=${encodeURIComponent(accessToken)}`;
    const webPath = path
      ? `/(dashboard)/web?path=${encodeURIComponent(path)}&${tokenParam}`
      : `/(dashboard)/web?${tokenParam}`;
    router.push(webPath as never);
  }

  async function handleSaveLogin() {
    if (!loginEmail.trim() || !loginPassword) {
      toast.warning('Required', 'Email and password are required.');
      return;
    }
    setLoginLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail.trim().toLowerCase(),
          password: loginPassword,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          message?: string; error?: string; title?: string; detail?: string;
        };
        throw new Error(err.message ?? err.error ?? err.detail ?? err.title ?? 'Invalid credentials');
      }
      const data = (await res.json()) as {
        accessToken: string;
        refreshToken?: string;
        user?: { firstName?: string };
      };
      if (!data.refreshToken) throw new Error('No refresh token returned — please try again.');
      // Store only the refresh token — never the password
      await dashboardAuth.save(loginEmail.trim(), data.refreshToken);
      setShowLoginModal(false);
      setLoginPassword('');
      const name = data.user?.firstName ?? loginEmail.trim();
      toast.success('Signed In', `Welcome, ${name}!`);
      // Navigate immediately with the fresh access token we just got
      const tokenParam = `token=${encodeURIComponent(data.accessToken)}`;
      router.push(`/(dashboard)/web?${tokenParam}` as never);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign in failed';
      toast.error('Sign In Failed', msg);
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleForgetLogin() {
    const ok = await confirm({
      title: 'Forget Login',
      description:
        'This will remove the saved dashboard session. You will need to sign in again.',
      confirmLabel: 'Forget',
      destructive: true,
    });
    if (!ok) return;
    await dashboardAuth.clear();
    toast.success('Cleared', 'Dashboard session has been forgotten.');
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {dashboardAuth.email ? (
            <View style={s.userBadge}>
              <Ionicons name="person-circle-outline" size={14} color="#a5b4fc" />
              <Text style={s.userBadgeText} numberOfLines={1}>
                {dashboardAuth.email.split('@')[0]}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity style={s.headerBtn} onPress={() => openWebDashboard()} activeOpacity={0.85}>
            <Ionicons name="globe-outline" size={16} color="#ccc" />
            <Text style={s.headerBtnText}>Open Web</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── Today's Snapshot ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 4 }}>
          <Text style={s.sectionTitle}>TODAY'S SNAPSHOT</Text>
          <TouchableOpacity onPress={fetchStats} disabled={statsLoading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {statsLoading ? (
              <ActivityIndicator size="small" color="#6366f1" />
            ) : (
              <Ionicons name="refresh" size={16} color="#666" />
            )}
          </TouchableOpacity>
        </View>
        <Text style={s.sectionSub}>
          {statsError ? statsError : 'Live figures from today'}
        </Text>
        <View style={s.statsGrid}>
          {(() => {
            const salesDelta = formatDelta(stats?.salesToday ?? 0, stats?.salesYesterday ?? 0);
            const ordersDelta = formatDelta(stats?.ordersToday ?? 0, stats?.ordersYesterday ?? 0);
            return (
              <>
                <View style={[s.statCard, { borderColor: '#22c55e55' }]}>
                  <Ionicons name="cash" size={22} color="#22c55e" />
                  <Text style={s.statLabel}>Sales Today</Text>
                  <Text style={[s.statValue, { color: '#22c55e' }]}>
                    ${(stats?.salesToday ?? 0).toFixed(2)}
                  </Text>
                  {!salesDelta.zero && (
                    <View
                      style={[
                        s.deltaPill,
                        salesDelta.positive ? s.deltaPillUp : s.deltaPillDown,
                      ]}
                    >
                      <Ionicons
                        name={salesDelta.positive ? 'arrow-up' : 'arrow-down'}
                        size={10}
                        color={salesDelta.positive ? '#22c55e' : '#ef4444'}
                      />
                      <Text
                        style={[
                          s.deltaText,
                          { color: salesDelta.positive ? '#22c55e' : '#ef4444' },
                        ]}
                      >
                        {salesDelta.text} vs yesterday
                      </Text>
                    </View>
                  )}
                </View>
                <View style={[s.statCard, { borderColor: '#6366f155' }]}>
                  <Ionicons name="receipt" size={22} color="#6366f1" />
                  <Text style={s.statLabel}>Orders</Text>
                  <Text style={[s.statValue, { color: '#6366f1' }]}>
                    {stats?.ordersToday ?? 0}
                  </Text>
                  {!ordersDelta.zero && (
                    <View
                      style={[
                        s.deltaPill,
                        ordersDelta.positive ? s.deltaPillUp : s.deltaPillDown,
                      ]}
                    >
                      <Ionicons
                        name={ordersDelta.positive ? 'arrow-up' : 'arrow-down'}
                        size={10}
                        color={ordersDelta.positive ? '#22c55e' : '#ef4444'}
                      />
                      <Text
                        style={[
                          s.deltaText,
                          { color: ordersDelta.positive ? '#22c55e' : '#ef4444' },
                        ]}
                      >
                        {ordersDelta.text} vs yesterday
                      </Text>
                    </View>
                  )}
                </View>
                <View style={[s.statCard, { borderColor: '#f59e0b55' }]}>
                  <Ionicons name="time" size={22} color="#f59e0b" />
                  <Text style={s.statLabel}>Pending</Text>
                  <Text style={[s.statValue, { color: '#f59e0b' }]}>
                    {stats?.pendingOrders ?? 0}
                  </Text>
                </View>
                <View style={[s.statCard, { borderColor: '#ec489955' }]}>
                  <Ionicons name="trending-up" size={22} color="#ec4899" />
                  <Text style={s.statLabel}>Top Seller</Text>
                  <Text style={[s.statValue, { color: '#ec4899', fontSize: 13 }]} numberOfLines={1}>
                    {stats?.topProduct ?? '—'}
                  </Text>
                </View>
              </>
            );
          })()}
        </View>

        {/* ── Period Comparison ── */}
        {stats && (stats.salesThisWeek > 0 || stats.salesLastWeek > 0) && (
          <>
            <Text style={s.sectionTitle}>PERIOD COMPARISON</Text>
            <Text style={s.sectionSub}>
              How this week stacks up against the last
            </Text>
            <View style={s.periodCard}>
              {(() => {
                const weekSalesDelta = formatDelta(stats.salesThisWeek, stats.salesLastWeek);
                const weekOrdersDelta = formatDelta(stats.ordersThisWeek, stats.ordersLastWeek);
                return (
                  <>
                    <View style={s.periodRow}>
                      <View style={s.periodLabelCol}>
                        <Text style={s.periodLabel}>Sales</Text>
                        <Text style={s.periodSub}>This week vs last</Text>
                      </View>
                      <View style={s.periodValueCol}>
                        <Text style={s.periodCurrent}>
                          ${stats.salesThisWeek.toFixed(2)}
                        </Text>
                        <Text style={s.periodPrev}>
                          was ${stats.salesLastWeek.toFixed(2)}
                        </Text>
                      </View>
                      {!weekSalesDelta.zero && (
                        <View
                          style={[
                            s.deltaPill,
                            weekSalesDelta.positive ? s.deltaPillUp : s.deltaPillDown,
                            { marginLeft: 10 },
                          ]}
                        >
                          <Ionicons
                            name={weekSalesDelta.positive ? 'arrow-up' : 'arrow-down'}
                            size={11}
                            color={weekSalesDelta.positive ? '#22c55e' : '#ef4444'}
                          />
                          <Text
                            style={[
                              s.deltaText,
                              {
                                color: weekSalesDelta.positive ? '#22c55e' : '#ef4444',
                                fontSize: 12,
                              },
                            ]}
                          >
                            {weekSalesDelta.text}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={s.periodDivider} />

                    <View style={s.periodRow}>
                      <View style={s.periodLabelCol}>
                        <Text style={s.periodLabel}>Orders</Text>
                        <Text style={s.periodSub}>This week vs last</Text>
                      </View>
                      <View style={s.periodValueCol}>
                        <Text style={s.periodCurrent}>{stats.ordersThisWeek}</Text>
                        <Text style={s.periodPrev}>was {stats.ordersLastWeek}</Text>
                      </View>
                      {!weekOrdersDelta.zero && (
                        <View
                          style={[
                            s.deltaPill,
                            weekOrdersDelta.positive ? s.deltaPillUp : s.deltaPillDown,
                            { marginLeft: 10 },
                          ]}
                        >
                          <Ionicons
                            name={weekOrdersDelta.positive ? 'arrow-up' : 'arrow-down'}
                            size={11}
                            color={weekOrdersDelta.positive ? '#22c55e' : '#ef4444'}
                          />
                          <Text
                            style={[
                              s.deltaText,
                              {
                                color: weekOrdersDelta.positive ? '#22c55e' : '#ef4444',
                                fontSize: 12,
                              },
                            ]}
                          >
                            {weekOrdersDelta.text}
                          </Text>
                        </View>
                      )}
                    </View>
                  </>
                );
              })()}
            </View>
          </>
        )}

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
              onPress={() => openWebDashboard(feat.route)}
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

        {/* ── Session info ── */}
        {dashboardAuth.email ? (
          <View style={s.sessionCard}>
            <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
            <Text style={s.sessionText} numberOfLines={1}>
              Signed in as {dashboardAuth.email}
            </Text>
            <TouchableOpacity onPress={handleForgetLogin}>
              <Text style={s.sessionAction}>Forget</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Text style={s.footerText}>ElevatedPOS Dashboard v{APP_VERSION}</Text>
          <Text style={s.footerText}>Powered by ElevatedPOS</Text>
        </View>
      </ScrollView>

      {/* ── Native Dashboard Login Modal ── */}
      <Modal
        visible={showLoginModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLoginModal(false)}
      >
        <Pressable style={s.modalOverlay} onPress={() => setShowLoginModal(false)}>
          <Pressable style={[s.modalContent, { width: 360 }]} onPress={() => {}}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#fff', marginBottom: 4 }}>
              Sign In to Dashboard
            </Text>
            <Text style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
              Sign in once — we'll keep you logged in automatically from now on.
            </Text>
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 6 }}>Email</Text>
            <TextInput
              style={s.loginInput}
              value={loginEmail}
              onChangeText={setLoginEmail}
              placeholder="owner@store.com"
              placeholderTextColor="#444"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loginLoading}
            />
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 6 }}>Password</Text>
            <TextInput
              style={s.loginInput}
              value={loginPassword}
              onChangeText={setLoginPassword}
              placeholder="••••••••"
              placeholderTextColor="#444"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loginLoading}
              onSubmitEditing={handleSaveLogin}
            />
            <TouchableOpacity
              style={[s.pinBtn, { marginTop: 16, opacity: loginLoading ? 0.6 : 1 }]}
              onPress={handleSaveLogin}
              disabled={loginLoading}
            >
              {loginLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Sign In</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowLoginModal(false)} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: '#666', fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

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

            <TouchableOpacity
              style={[s.settBtn, { backgroundColor: '#f59e0b', marginTop: 8 }]}
              onPress={() => {
                setNewPinValue('');
                setConfirmPinValue('');
                setShowChangePinModal(true);
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Change Admin PIN</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Change Admin PIN Modal ── */}
      <Modal visible={showChangePinModal} transparent animationType="fade" onRequestClose={() => setShowChangePinModal(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setShowChangePinModal(false)}>
          <Pressable style={s.modalContent} onPress={() => {}}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 4 }}>Change Admin PIN</Text>
            <Text style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>Enter a new 4–6 digit PIN</Text>
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 6 }}>New PIN</Text>
            <TextInput
              style={s.pinInput}
              value={newPinValue}
              onChangeText={setNewPinValue}
              placeholder="New PIN"
              placeholderTextColor="#444"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              autoFocus
            />
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 6, marginTop: 10 }}>Confirm PIN</Text>
            <TextInput
              style={s.pinInput}
              value={confirmPinValue}
              onChangeText={setConfirmPinValue}
              placeholder="Confirm PIN"
              placeholderTextColor="#444"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              onSubmitEditing={handleSaveNewPin}
            />
            <TouchableOpacity style={[s.pinBtn, { marginTop: 16 }]} onPress={handleSaveNewPin}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Save PIN</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowChangePinModal(false)} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: '#666', fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
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
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(99,102,241,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.25)',
    maxWidth: 130,
  },
  userBadgeText: { color: '#a5b4fc', fontSize: 12, fontWeight: '700', flexShrink: 1 },

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

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 22,
  },
  statCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#141425',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },

  // Delta pill (period-over-period)
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 6,
    borderWidth: 1,
  },
  deltaPillUp: {
    backgroundColor: 'rgba(34,197,94,0.10)',
    borderColor: 'rgba(34,197,94,0.30)',
  },
  deltaPillDown: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderColor: 'rgba(239,68,68,0.30)',
  },
  deltaText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  // Period comparison card
  periodCard: {
    backgroundColor: '#141425',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e1e2e',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 22,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  periodLabelCol: { flex: 1 },
  periodLabel: { color: '#fff', fontSize: 14, fontWeight: '800' },
  periodSub: { color: '#555', fontSize: 11, marginTop: 2, fontWeight: '600' },
  periodValueCol: { alignItems: 'flex-end' },
  periodCurrent: { color: '#a5b4fc', fontSize: 16, fontWeight: '900' },
  periodPrev: { color: '#444', fontSize: 11, marginTop: 2 },
  periodDivider: { height: 1, backgroundColor: '#1e1e2e' },

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
  loginInput: {
    backgroundColor: '#0d0d14',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    marginBottom: 12,
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 6,
    marginBottom: 16,
  },
  sessionText: { flex: 1, color: '#22c55e', fontSize: 12, fontWeight: '700' },
  sessionAction: { color: '#888', fontSize: 12, fontWeight: '700' },
  settCard: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e1e2e' },
  settLabel: { color: '#888', fontSize: 13 },
  settValue: { color: '#ccc', fontSize: 13, fontWeight: '600' },
  settBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
});
