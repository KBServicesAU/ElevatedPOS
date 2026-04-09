import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import { useDeviceStore } from '../../store/device';
import { printText } from '../../lib/printer';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const DOWNLOADS_API =
  process.env['EXPO_PUBLIC_STOREFRONT_URL']
    ? `${process.env['EXPO_PUBLIC_STOREFRONT_URL'].replace(/\/+$/, '')}/api/downloads/latest`
    : 'https://elevatedpos.com.au/api/downloads/latest';

interface KdsItem {
  name: string;
  qty: number;
  modifiers?: string[];
}

interface KdsTicket {
  id: string;
  orderNumber: string;
  channel: string;
  items: KdsItem[];
  createdAt: string;
  status: 'pending' | 'in_progress' | 'ready';
}

const ORDERS_API = process.env['EXPO_PUBLIC_ORDERS_API_URL'] ?? 'http://localhost:4004';

function getElapsedSeconds(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getTimerColor(seconds: number): string {
  if (seconds < 300) return '#22c55e';   // green < 5 min
  if (seconds < 600) return '#f59e0b';   // yellow < 10 min
  return '#ef4444';                       // red 10 min+
}

function getChannelColor(channel: string): string {
  switch (channel.toLowerCase()) {
    case 'pos': return '#6366f1';
    case 'kiosk': return '#f59e0b';
    case 'online': return '#06b6d4';
    default: return '#888';
  }
}

function TicketCard({ ticket, onBump }: { ticket: KdsTicket; onBump: (id: string) => void }) {
  const [elapsed, setElapsed] = useState(getElapsedSeconds(ticket.createdAt));
  const [bumping, setBumping] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(getElapsedSeconds(ticket.createdAt)), 1000);
    return () => clearInterval(interval);
  }, [ticket.createdAt]);

  async function handleBump() {
    setBumping(true);
    try { await onBump(ticket.id); } finally { setBumping(false); }
  }

  const timerColor = getTimerColor(elapsed);
  const channelColor = getChannelColor(ticket.channel);

  return (
    <View style={[styles.card, { borderTopColor: timerColor }]}>
      <View style={styles.cardHeader}>
        <View style={styles.orderRow}>
          <Text style={styles.orderNumber}>#{ticket.orderNumber}</Text>
          <View style={[styles.channelBadge, { backgroundColor: `${channelColor}22`, borderColor: `${channelColor}55` }]}>
            <Text style={[styles.channelText, { color: channelColor }]}>{ticket.channel.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={[styles.timer, { color: timerColor }]}>{formatElapsed(elapsed)}</Text>
      </View>

      <View style={styles.itemsList}>
        {ticket.items.map((item, idx) => (
          <View key={idx} style={styles.itemRow}>
            <Text style={styles.itemQty}>{item.qty}x</Text>
            <View style={styles.itemDetails}>
              <Text style={styles.itemName}>{item.name}</Text>
              {item.modifiers?.map((mod, mi) => (
                <Text key={mi} style={styles.itemMod}>· {mod}</Text>
              ))}
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.bumpBtn, bumping ? styles.bumpBtnBumping : null]}
        onPress={handleBump}
        disabled={bumping}
        activeOpacity={0.8}
      >
        {bumping ? (
          <ActivityIndicator color="#000" size="small" />
        ) : (
          <Text style={styles.bumpBtnText}>BUMP</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function KDSScreen() {
  const { identity } = useDeviceStore();
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  // Sound settings
  const [soundEnabled, setSoundEnabled] = useState(true);
  const ticketCountRef = useRef(0);

  // Label print on bump
  const [printOnBump, setPrintOnBump] = useState(false);

  // Play beep on new ticket
  useEffect(() => {
    if (tickets.length > ticketCountRef.current && soundEnabled) {
      // New ticket arrived — play beep
      (async () => {
        try {
          const { sound } = await Audio.Sound.createAsync(
            { uri: 'https://cdn.elevatedpos.com.au/sounds/beep.mp3' },
            { shouldPlay: true },
          );
          setTimeout(() => sound.unloadAsync(), 2000);
        } catch { /* sound failed — non-critical */ }
      })();
    }
    ticketCountRef.current = tickets.length;
  }, [tickets.length, soundEnabled]);

  // Order summary — aggregate item counts across all tickets
  const orderSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tickets) {
      for (const item of t.items) {
        counts.set(item.name, (counts.get(item.name) ?? 0) + item.qty);
      }
    }
    return Array.from(counts.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty);
  }, [tickets]);

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [updateUrl, setUpdateUrl] = useState<string | null>(null);
  const [updateChangelog, setUpdateChangelog] = useState<string[]>([]);

  async function checkForUpdate() {
    setUpdateChecking(true);
    try {
      const res = await fetch(`${DOWNLOADS_API}?app=kds`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json() as { version: string; downloadUrl: string; changelog: string[] };
      setLatestVersion(data.version);
      setUpdateUrl(data.downloadUrl);
      setUpdateChangelog(data.changelog ?? []);
    } catch {
      Alert.alert('Update Check Failed', 'Could not reach the update server. Check your network connection.');
    } finally {
      setUpdateChecking(false);
    }
  }

  function handleDownloadUpdate() {
    if (!updateUrl) return;
    Linking.openURL(updateUrl);
  }

  function isUpdateAvailable(): boolean {
    if (!latestVersion) return false;
    const a = APP_VERSION.split('.').map(Number);
    const b = latestVersion.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((b[i] ?? 0) > (a[i] ?? 0)) return true;
      if ((b[i] ?? 0) < (a[i] ?? 0)) return false;
    }
    return false;
  }

  const connect = useCallback(() => {
    if (!identity) return;
    const wsBase = ORDERS_API.replace(/^http/, 'ws');
    const url = `${wsBase}/api/v1/kds/stream?locationId=${identity.locationId}`;

    try {
      const ws = new WebSocket(url, undefined);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted.current) return;
        setConnected(true);
        setError(null);
        reconnectAttempt.current = 0;
        // Send auth
        ws.send(JSON.stringify({ type: 'auth', token: identity.deviceToken }));
      };

      ws.onmessage = (event) => {
        if (!isMounted.current) return;
        try {
          const msg = JSON.parse(event.data as string) as { type: string; tickets?: KdsTicket[]; ticket?: KdsTicket; ticketId?: string };
          if (msg.type === 'snapshot' && msg.tickets) {
            setTickets(msg.tickets);
          } else if (msg.type === 'ticket_created' && msg.ticket) {
            setTickets((prev) => [...prev, msg.ticket!]);
          } else if (msg.type === 'ticket_bumped' && msg.ticketId) {
            setTickets((prev) => prev.filter((t) => t.id !== msg.ticketId));
          }
        } catch {
            // Non-critical: failed to parse WebSocket message; skip
            console.warn('[KDS] Could not parse WebSocket message');
          }
      };

      ws.onclose = () => {
        if (!isMounted.current) return;
        setConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        if (!isMounted.current) return;
        setError('Connection error');
        setConnected(false);
      };
    } catch (err) {
      setError('Failed to connect');
      scheduleReconnect();
    }
  }, [identity]);

  function scheduleReconnect() {
    const attempt = reconnectAttempt.current;
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
    reconnectAttempt.current += 1;
    reconnectTimeout.current = setTimeout(() => {
      if (isMounted.current) connect();
    }, delay);
  }

  useEffect(() => {
    isMounted.current = true;
    connect();
    return () => {
      isMounted.current = false;
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, [connect]);

  async function handleBump(ticketId: string) {
    if (!identity) return;

    // Capture ticket data before removal for label printing
    const ticket = tickets.find((t) => t.id === ticketId);

    try {
      await fetch(`${ORDERS_API}/api/v1/kds/tickets/${ticketId}/bump`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${identity.deviceToken}`,
        },
      });
    } catch {
      // Bump API call failed — ticket removed optimistically; WS event will confirm
      console.warn('[KDS] Bump API call failed for ticket', ticketId);
    }

    // Print label if enabled
    if (printOnBump && ticket) {
      try {
        const itemLines = ticket.items.map((i) => `${i.qty}x ${i.name}`).join('\n');
        const label = `ORDER #${ticket.orderNumber}\n-----------\n${itemLines}\n-----------\n\n`;
        await printText(label);
      } catch (e) {
        console.warn('[KDS] Label print failed:', e);
      }
    }

    // Optimistic removal
    setTickets((prev) => prev.filter((t) => t.id !== ticketId));
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Kitchen Display</Text>
        <View style={styles.headerRight}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={[styles.connDot, { backgroundColor: connected ? '#22c55e' : '#ef4444' }]} />
          <Text style={styles.connLabel}>{connected ? 'Live' : 'Reconnecting...'}</Text>
          <TouchableOpacity
            onPress={() => { setShowSettings(true); checkForUpdate(); }}
            style={styles.gearBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.gearIcon}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Settings / Update Modal */}
      <Modal visible={showSettings} transparent animationType="fade" onRequestClose={() => setShowSettings(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Settings</Text>

            {/* ── Sound & Print ── */}
            <Text style={{ color: '#888', fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 1 }}>ALERTS & PRINTING</Text>
            <View style={styles.modalCard}>
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>New Order Sound</Text>
                <Switch value={soundEnabled} onValueChange={setSoundEnabled} trackColor={{ false: '#2a2a2a', true: '#6366f180' }} thumbColor={soundEnabled ? '#6366f1' : '#555'} />
              </View>
              <View style={styles.modalDivider} />
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Print Label on Bump</Text>
                <Switch value={printOnBump} onValueChange={setPrintOnBump} trackColor={{ false: '#2a2a2a', true: '#6366f180' }} thumbColor={printOnBump ? '#6366f1' : '#555'} />
              </View>
            </View>

            {/* ── Timer Colors ── */}
            <Text style={{ color: '#888', fontSize: 11, fontWeight: '700', marginTop: 14, marginBottom: 6, letterSpacing: 1 }}>TIMER THRESHOLDS</Text>
            <View style={styles.modalCard}>
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Green → Yellow</Text>
                <Text style={styles.modalValue}>5 min</Text>
              </View>
              <View style={styles.modalDivider} />
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Yellow → Red</Text>
                <Text style={styles.modalValue}>10 min</Text>
              </View>
            </View>

            {/* ── Device ── */}
            <Text style={{ color: '#888', fontSize: 11, fontWeight: '700', marginTop: 14, marginBottom: 6, letterSpacing: 1 }}>DEVICE</Text>
            <View style={styles.modalCard}>
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>App Version</Text>
                <Text style={styles.modalValue}>{APP_VERSION}</Text>
              </View>
              <View style={styles.modalDivider} />
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Latest Version</Text>
                {updateChecking ? (
                  <ActivityIndicator size="small" color="#f59e0b" />
                ) : (
                  <Text style={[styles.modalValue, isUpdateAvailable() && { color: '#f59e0b', fontWeight: '700' }]}>
                    {latestVersion ?? '—'}
                  </Text>
                )}
              </View>
              <View style={styles.modalDivider} />
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Role</Text>
                <Text style={styles.modalValue}>KDS</Text>
              </View>
              <View style={styles.modalDivider} />
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Device ID</Text>
                <Text style={styles.modalValue}>{identity?.deviceId?.slice(0, 12) ?? '—'}…</Text>
              </View>
            </View>

            {isUpdateAvailable() && updateUrl ? (
              <TouchableOpacity style={styles.modalUpdateBtn} onPress={handleDownloadUpdate} activeOpacity={0.85}>
                <Text style={styles.modalUpdateBtnText}>Download Update v{latestVersion}</Text>
              </TouchableOpacity>
            ) : !updateChecking ? (
              <View style={styles.modalUpToDate}>
                <Text style={styles.modalUpToDateText}>✓ Up to date</Text>
              </View>
            ) : null}

            {updateChangelog.length > 0 && isUpdateAvailable() && (
              <View style={styles.modalChangelog}>
                {updateChangelog.map((entry, i) => (
                  <Text key={i} style={styles.modalChangelogItem}>• {entry}</Text>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={styles.modalCheckBtn}
              onPress={checkForUpdate}
              disabled={updateChecking}
              activeOpacity={0.85}
            >
              <Text style={styles.modalCheckBtnText}>Check for Updates</Text>
            </TouchableOpacity>

            {/* Unpair */}
            <TouchableOpacity
              style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#ef4444' }}
              onPress={() => {
                Alert.alert('Unpair Device', 'This will remove all credentials. You will need to pair again.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Unpair', style: 'destructive', onPress: async () => {
                    const { clearIdentity } = useDeviceStore.getState();
                    await clearIdentity();
                    setShowSettings(false);
                  }},
                ]);
              }}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#ef4444' }}>Unpair Device</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowSettings(false)} activeOpacity={0.85}>
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* Left: Order Summary Sidebar */}
        {tickets.length > 0 && (
          <View style={{ width: 180, backgroundColor: '#111', borderRightWidth: 1, borderRightColor: '#222', paddingTop: 12 }}>
            <Text style={{ color: '#888', fontSize: 11, fontWeight: '700', paddingHorizontal: 12, marginBottom: 8, letterSpacing: 1 }}>TO MAKE</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {orderSummary.map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: '#f59e0b', minWidth: 30 }}>{item.qty}x</Text>
                  <Text style={{ fontSize: 13, color: '#ccc', fontWeight: '600', flex: 1 }} numberOfLines={1}>{item.name}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#222' }}>
              <Text style={{ color: '#555', fontSize: 11 }}>{tickets.length} orders · {orderSummary.reduce((s, i) => s + i.qty, 0)} items</Text>
            </View>
          </View>
        )}

        {/* Right: Ticket Grid */}
        {tickets.length === 0 ? (
          <View style={styles.clearKitchen}>
            <Text style={styles.clearEmoji}>✅</Text>
            <Text style={styles.clearTitle}>Kitchen Clear</Text>
            <Text style={styles.clearSub}>No pending tickets</Text>
          </View>
        ) : (
          <FlatList
            data={tickets}
            keyExtractor={(t) => t.id}
            numColumns={3}
            contentContainerStyle={styles.ticketGrid}
            renderItem={({ item }) => <TicketCard ticket={item} onBump={handleBump} />}
            style={{ flex: 1 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorText: { fontSize: 12, color: '#ef4444' },
  connDot: { width: 10, height: 10, borderRadius: 5 },
  connLabel: { fontSize: 13, color: '#888', fontWeight: '600' },
  clearKitchen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  clearEmoji: { fontSize: 64, marginBottom: 16 },
  clearTitle: { fontSize: 28, fontWeight: '800', color: '#22c55e', marginBottom: 8 },
  clearSub: { fontSize: 16, color: '#555' },
  ticketGrid: { padding: 12, gap: 12 },
  card: {
    flex: 1,
    backgroundColor: '#141414',
    borderRadius: 16,
    margin: 6,
    borderTopWidth: 4,
    borderTopColor: '#22c55e',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    overflow: 'hidden',
    minWidth: 200,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderNumber: { fontSize: 20, fontWeight: '900', color: '#fff' },
  channelBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  channelText: { fontSize: 11, fontWeight: '700' },
  timer: { fontSize: 22, fontWeight: '900' },
  itemsList: { paddingHorizontal: 14, paddingBottom: 12, flex: 1 },
  itemRow: { flexDirection: 'row', marginBottom: 6 },
  itemQty: { fontSize: 15, fontWeight: '800', color: '#f59e0b', marginRight: 8, minWidth: 24 },
  itemDetails: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  itemMod: { fontSize: 12, color: '#666', marginTop: 1 },
  bumpBtn: {
    backgroundColor: '#22c55e',
    margin: 10,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  bumpBtnBumping: { opacity: 0.6 },
  bumpBtnText: { fontSize: 16, fontWeight: '900', color: '#000', letterSpacing: 1 },

  // Gear button
  gearBtn: { marginLeft: 12, padding: 4 },
  gearIcon: { fontSize: 20, color: '#888' },

  // Settings modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#141414', borderRadius: 20, padding: 24, width: 380, maxWidth: '90%', borderWidth: 1, borderColor: '#2a2a2a' },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 20 },
  modalCard: { backgroundColor: '#1a1a1a', borderRadius: 14, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 16 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  modalDivider: { height: 1, backgroundColor: '#222', marginHorizontal: 14 },
  modalLabel: { fontSize: 13, color: '#777' },
  modalValue: { fontSize: 13, color: '#ccc', fontWeight: '500' },
  modalUpdateBtn: { backgroundColor: '#f59e0b', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 10 },
  modalUpdateBtnText: { fontSize: 15, fontWeight: '700', color: '#000' },
  modalUpToDate: { backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)' },
  modalUpToDateText: { fontSize: 14, color: '#22c55e', fontWeight: '600' },
  modalChangelog: { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, marginBottom: 10 },
  modalChangelogItem: { fontSize: 12, color: '#999', lineHeight: 18 },
  modalCheckBtn: { backgroundColor: '#1e1e1e', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#2a2a2a' },
  modalCheckBtnText: { fontSize: 14, fontWeight: '600', color: '#ccc' },
  modalCloseBtn: { paddingVertical: 10, alignItems: 'center' },
  modalCloseBtnText: { fontSize: 14, fontWeight: '600', color: '#666' },
});
