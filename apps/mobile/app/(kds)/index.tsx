import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  FlatList,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { confirm, toast } from '../../components/ui';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useDeviceStore } from '../../store/device';
import { usePrinterStore, type PrinterConnectionType } from '../../store/printers';
import { loadKdsSettings, type KdsSettings, BEEP_URLS } from './settings';
import {
  useSmsStore,
  renderSmsBody,
  normaliseMobile,
} from '../../store/sms';
import {
  printText,
  printTestPage,
  discoverPrinters,
  connectPrinter,
  type DiscoveredPrinter,
} from '../../lib/printer';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const DOWNLOADS_API =
  process.env['EXPO_PUBLIC_STOREFRONT_URL']
    ? `${process.env['EXPO_PUBLIC_STOREFRONT_URL'].replace(/\/+$/, '')}/api/downloads/latest`
    : 'https://elevatedpos.com.au/api/downloads/latest';

interface KdsItem {
  name: string;
  qty: number;
  modifiers?: string[];
  allergens?: string[];
  notes?: string;
  station?: string; // grill, fryer, salad, bar, expo
}

interface KdsTicket {
  id: string;
  orderNumber: string;
  channel: string;
  items: KdsItem[];
  createdAt: string;
  status: 'pending' | 'in_progress' | 'ready';
  station?: string;
  customerName?: string;
  customerPhone?: string;
}

interface BumpedTicket extends KdsTicket {
  bumpedAt: number;
}

const STATIONS = [
  { id: 'all', label: 'All', color: '#6366f1' },
  { id: 'grill', label: 'Grill', color: '#ef4444' },
  { id: 'fryer', label: 'Fryer', color: '#f59e0b' },
  { id: 'salad', label: 'Salad', color: '#22c55e' },
  { id: 'bar', label: 'Bar', color: '#06b6d4' },
  { id: 'expo', label: 'Expo', color: '#a78bfa' },
] as const;

type StationId = (typeof STATIONS)[number]['id'];

function ticketStation(ticket: KdsTicket): string {
  if (ticket.station) return ticket.station;
  // Infer from first item with a station
  const itemWithStation = ticket.items.find((i) => i.station);
  return itemWithStation?.station ?? 'all';
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
              {item.notes && (
                <Text style={{ fontSize: 11, color: '#f59e0b', fontStyle: 'italic', marginTop: 2 }}>📝 {item.notes}</Text>
              )}
              {item.allergens && item.allergens.length > 0 && (
                <Text style={{ fontSize: 10, color: '#ef4444', fontWeight: '700', marginTop: 2 }}>
                  ⚠ {item.allergens.join(', ')}
                </Text>
              )}
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

// ─────────────────────────────────────────────────────────────────
// Expeditor card — compact ticket showing per-item ready status
// across all stations. Lets the expo lead "tick off" each item
// as it's plated and bump the entire order when ready to send.
// ─────────────────────────────────────────────────────────────────
function ExpoTicketCard({
  ticket,
  isItemReady,
  onToggleItem,
  onBump,
  allReady,
}: {
  ticket: KdsTicket;
  isItemReady: (id: string, idx: number) => boolean;
  onToggleItem: (id: string, idx: number) => void;
  onBump: (id: string) => void;
  allReady: boolean;
}) {
  const [elapsed, setElapsed] = useState(getElapsedSeconds(ticket.createdAt));
  const [bumping, setBumping] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(getElapsedSeconds(ticket.createdAt)), 1000);
    return () => clearInterval(interval);
  }, [ticket.createdAt]);

  const timerColor = getTimerColor(elapsed);
  const channelColor = getChannelColor(ticket.channel);
  const readyCount = ticket.items.filter((_, i) => isItemReady(ticket.id, i)).length;

  const handleBump = async () => {
    setBumping(true);
    try { await onBump(ticket.id); } finally { setBumping(false); }
  };

  return (
    <View
      style={[
        styles.expoCard,
        { borderTopColor: timerColor },
        allReady && { borderColor: '#22c55e', borderWidth: 2, backgroundColor: '#0f1f15' },
      ]}
    >
      <View style={styles.expoCardHead}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Text style={styles.orderNumber}>#{ticket.orderNumber}</Text>
          <View style={[styles.channelBadge, { backgroundColor: `${channelColor}22`, borderColor: `${channelColor}55` }]}>
            <Text style={[styles.channelText, { color: channelColor }]}>{ticket.channel.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.expoProgress}>
          {readyCount}/{ticket.items.length}
        </Text>
        <Text style={[styles.timer, { color: timerColor, marginLeft: 8 }]}>{formatElapsed(elapsed)}</Text>
      </View>

      <View style={styles.expoItems}>
        {ticket.items.map((item, idx) => {
          const ready = isItemReady(ticket.id, idx);
          const stationId = item.station ?? 'all';
          const stationDef = STATIONS.find((st) => st.id === stationId) ?? STATIONS[0];
          return (
            <TouchableOpacity
              key={idx}
              activeOpacity={0.7}
              onPress={() => onToggleItem(ticket.id, idx)}
              style={[
                styles.expoItemRow,
                ready && styles.expoItemRowReady,
              ]}
            >
              <View
                style={[
                  styles.expoCheck,
                  ready && { backgroundColor: '#22c55e', borderColor: '#22c55e' },
                ]}
              >
                {ready ? <Text style={styles.expoCheckMark}>✓</Text> : null}
              </View>
              <View
                style={[styles.stationDot, { backgroundColor: stationDef.color, marginRight: 6 }]}
              />
              <Text style={[styles.expoItemQty, ready && styles.expoItemTextReady]}>
                {item.qty}x
              </Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.expoItemName,
                    ready && styles.expoItemTextReady,
                  ]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                {item.modifiers && item.modifiers.length > 0 ? (
                  <Text
                    style={[styles.expoItemMods, ready && styles.expoItemTextReady]}
                    numberOfLines={1}
                  >
                    {item.modifiers.join(' · ')}
                  </Text>
                ) : null}
              </View>
              <Text
                style={[styles.expoItemStation, { color: stationDef.color }]}
              >
                {stationDef.label.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[
          styles.expoBumpBtn,
          allReady ? styles.expoBumpReady : styles.expoBumpWaiting,
          bumping && { opacity: 0.6 },
        ]}
        onPress={handleBump}
        disabled={bumping}
        activeOpacity={0.85}
      >
        {bumping ? (
          <ActivityIndicator color="#000" size="small" />
        ) : (
          <Text style={[styles.bumpBtnText, allReady && { color: '#000' }]}>
            {allReady ? 'SERVE & BUMP' : 'BUMP'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function KDSScreen() {
  const router = useRouter();
  const {
    identity,
    activeLocationId,
    availableLocations,
    fetchAvailableLocations,
    setActiveLocationId,
    checkHeartbeat,
  } = useDeviceStore();
  const { config: printerConfig, setConfig: setPrinterConfig, hydrate: hydratePrinter } = usePrinterStore();
  const {
    config: smsConfig,
    setConfig: setSmsConfig,
    hydrate: hydrateSms,
    recordSend: recordSmsSend,
  } = useSmsStore();

  // ── Device heartbeat (revocation check) ────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      checkHeartbeat().then(() => {
        if (!useDeviceStore.getState().identity) {
          router.replace('/pair');
        }
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, [checkHeartbeat, router]);

  /** Location to actually subscribe to — override or device default. */
  const effectiveLocationId = activeLocationId ?? identity?.locationId ?? null;
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);
  /** Incremented each time the connection target changes, so stale onclose
   * handlers from a previous target don't trigger a reconnect after the
   * location has already been swapped. */
  const connectionVersion = useRef(0);

  // Persisted KDS settings (loaded from AsyncStorage, refreshed when returning
  // from the settings screen via AppState focus events).
  const [kdsSettings, setKdsSettings] = useState<KdsSettings | null>(null);

  useEffect(() => {
    loadKdsSettings().then(setKdsSettings);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        loadKdsSettings().then(setKdsSettings);
      }
    });
    return () => sub.remove();
  }, []);

  // Sound settings — derived from persisted kdsSettings; local toggle kept for
  // the inline modal that is still mounted (though no longer opened by the gear
  // button, which now routes to the settings screen).
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevTicketIdsRef = useRef<Set<string>>(new Set());

  // Station filter
  const [activeStation, setActiveStation] = useState<StationId>('all');

  // Expeditor mode — aggregated multi-station readiness view.
  // Seeded from the persisted viewMode preference once kdsSettings loads.
  const [expoMode, setExpoMode] = useState(false);
  const expoModeSeededRef = useRef(false);
  useEffect(() => {
    if (kdsSettings && !expoModeSeededRef.current) {
      expoModeSeededRef.current = true;
      setExpoMode(kdsSettings.viewMode === 'expeditor');
    }
  }, [kdsSettings]);
  const [itemReady, setItemReady] = useState<Record<string, boolean>>({});

  // Recall panel
  const [showRecall, setShowRecall] = useState(false);
  const [bumpedHistory, setBumpedHistory] = useState<BumpedTicket[]>([]);

  // Undo bump toast
  const [undoTicket, setUndoTicket] = useState<KdsTicket | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslate = useRef(new Animated.Value(80)).current;

  // Bump error toast
  const [bumpError, setBumpError] = useState<string | null>(null);
  const errorOpacity = useRef(new Animated.Value(0)).current;

  // Label print on bump — local toggle kept for the inline modal; the
  // persisted value from kdsSettings takes precedence when available.
  const [printOnBump, setPrintOnBump] = useState(false);
  const printOnBumpEffective = kdsSettings?.printOnBump ?? printOnBump;

  // Label printer discovery
  const [discovering, setDiscovering] = useState(false);
  const [discoveredPrinters, setDiscoveredPrinters] = useState<DiscoveredPrinter[]>([]);

  // Hydrate printer + SMS config on mount
  useEffect(() => {
    hydratePrinter();
    hydrateSms();
  }, [hydratePrinter, hydrateSms]);

  // Fetch available locations on mount (for multi-location orgs)
  useEffect(() => {
    if (identity) {
      fetchAvailableLocations().catch(() => { /* non-critical */ });
    }
  }, [identity, fetchAvailableLocations]);

  async function handleSwitchLocation(newLocationId: string) {
    if (newLocationId === effectiveLocationId) return;
    await setActiveLocationId(newLocationId === identity?.locationId ? null : newLocationId);
    // `connect` useCallback's dependency on effectiveLocationId will trigger
    // the WebSocket to reconnect automatically.
  }

  async function handleDiscoverPrinters(type: PrinterConnectionType) {
    setDiscovering(true);
    try {
      const devices = await discoverPrinters(type);
      setDiscoveredPrinters(devices);
      if (devices.length === 0) {
        toast.warning(
          'No Printers Found',
          `No ${type.toUpperCase()} printers detected. Check the connection.`,
        );
      }
    } catch (err) {
      toast.error(
        'Discovery Failed',
        err instanceof Error ? err.message : 'Could not scan for printers',
      );
    } finally {
      setDiscovering(false);
    }
  }

  async function handleSelectPrinter(printer: DiscoveredPrinter) {
    try {
      await setPrinterConfig({
        type: printer.type,
        address: printer.id,
        name: printer.name,
      });
      setDiscoveredPrinters([]);
      toast.success(
        'Printer Saved',
        `${printer.name} will print labels when you bump orders.`,
      );
    } catch (err) {
      toast.error('Error', err instanceof Error ? err.message : 'Could not save printer');
    }
  }

  async function handleTestPrinter() {
    if (!printerConfig.type) {
      toast.warning('No Printer', 'Please configure a label printer first.');
      return;
    }
    try {
      await printTestPage();
      toast.success('Test Print Sent', 'Check the printer for a test page.');
    } catch (err) {
      toast.error(
        'Print Failed',
        err instanceof Error ? err.message : 'Could not print',
      );
    }
  }

  async function handleClearPrinter() {
    await setPrinterConfig({ type: null, address: '', name: '' });
    setDiscoveredPrinters([]);
  }

  // Play beep only when a genuinely NEW ticket (unrecognised ID) appears.
  // Respects the persisted sound settings (enabled flag + beep type).
  useEffect(() => {
    const currentIds = new Set(tickets.map((t) => t.id));
    const hasNewTicket = tickets.some((t) => !prevTicketIdsRef.current.has(t.id));
    // Use persisted setting when available, fall back to local toggle state.
    const effectiveSoundEnabled = kdsSettings ? kdsSettings.soundEnabled : soundEnabled;
    if (hasNewTicket && prevTicketIdsRef.current.size > 0 && effectiveSoundEnabled) {
      (async () => {
        try {
          const beepType = kdsSettings?.beepType ?? 'ding';
          const uri = BEEP_URLS[beepType];
          const { sound } = await Audio.Sound.createAsync(
            { uri },
            { shouldPlay: true },
          );
          setTimeout(() => sound.unloadAsync(), 3000);
        } catch { /* sound failed — non-critical */ }
      })();
    }
    prevTicketIdsRef.current = currentIds;
  }, [tickets, soundEnabled, kdsSettings]);

  // K5 — Repeating beep while there are pending tickets.
  // Fires every `beepIntervalSeconds` seconds as long as:
  //   • kdsSettings.beepIntervalSeconds is not null
  //   • sound is enabled
  //   • there is at least one pending ticket
  const beepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    // Clear any existing interval first
    if (beepIntervalRef.current !== null) {
      clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
    }

    const intervalSecs = kdsSettings?.beepIntervalSeconds ?? null;
    const soundOn = kdsSettings ? kdsSettings.soundEnabled : soundEnabled;

    if (intervalSecs === null || !soundOn || tickets.length === 0) return;

    beepIntervalRef.current = setInterval(() => {
      if (useDeviceStore.getState().identity === null) return; // safety
      (async () => {
        try {
          const beepType = kdsSettings?.beepType ?? 'ding';
          const uri = BEEP_URLS[beepType];
          const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
          setTimeout(() => sound.unloadAsync(), 3000);
        } catch { /* non-critical */ }
      })();
    }, intervalSecs * 1000);

    return () => {
      if (beepIntervalRef.current !== null) {
        clearInterval(beepIntervalRef.current);
        beepIntervalRef.current = null;
      }
    };
  }, [tickets.length, kdsSettings?.beepIntervalSeconds, kdsSettings?.soundEnabled, kdsSettings?.beepType, soundEnabled]);

  // Filtered tickets by station
  const visibleTickets = useMemo(() => {
    if (activeStation === 'all') return tickets;
    return tickets.filter((t) => {
      const station = ticketStation(t);
      if (station === activeStation) return true;
      // Also include if any item belongs to the station
      return t.items.some((i) => i.station === activeStation);
    });
  }, [tickets, activeStation]);

  // Order summary — aggregate item counts across visible tickets
  const orderSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of visibleTickets) {
      for (const item of t.items) {
        counts.set(item.name, (counts.get(item.name) ?? 0) + item.qty);
      }
    }
    return Array.from(counts.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty);
  }, [visibleTickets]);

  // Per-station counts for filter chip badges
  const stationCounts = useMemo(() => {
    const counts: Record<string, number> = { all: tickets.length };
    for (const t of tickets) {
      const station = ticketStation(t);
      counts[station] = (counts[station] ?? 0) + 1;
      for (const item of t.items) {
        if (item.station && item.station !== station) {
          counts[item.station] = (counts[item.station] ?? 0) + 1;
        }
      }
    }
    return counts;
  }, [tickets]);

  // ── Expeditor helpers ───────────────────────────────────────────
  function getItemKey(ticketId: string, idx: number): string {
    return `${ticketId}::${idx}`;
  }

  function toggleItemReady(ticketId: string, idx: number) {
    const k = getItemKey(ticketId, idx);
    setItemReady((prev) => ({ ...prev, [k]: !prev[k] }));
  }

  function isItemReady(ticketId: string, idx: number): boolean {
    return itemReady[getItemKey(ticketId, idx)] === true;
  }

  function isTicketAllReady(t: KdsTicket): boolean {
    if (t.items.length === 0) return false;
    for (let i = 0; i < t.items.length; i++) {
      if (!isItemReady(t.id, i)) return false;
    }
    return true;
  }

  // Per-station progress (ready/pending) across all tickets
  const stationProgress = useMemo(() => {
    const acc: Record<string, { ready: number; pending: number }> = {};
    for (const t of tickets) {
      t.items.forEach((item, idx) => {
        const stn = item.station ?? ticketStation(t) ?? 'all';
        if (!acc[stn]) acc[stn] = { ready: 0, pending: 0 };
        const ready = isItemReady(t.id, idx);
        if (ready) acc[stn]!.ready += item.qty;
        else acc[stn]!.pending += item.qty;
      });
    }
    return acc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, itemReady]);

  // Clean up stale itemReady entries when tickets disappear (bumped/removed)
  useEffect(() => {
    setItemReady((prev) => {
      const validIds = new Set(tickets.map((t) => t.id));
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const k of Object.keys(prev)) {
        const ticketId = k.split('::')[0];
        if (ticketId && validIds.has(ticketId)) {
          next[k] = prev[k]!;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tickets]);

  // ── Toast helpers ──
  function showUndoToast(ticket: KdsTicket) {
    setUndoTicket(ticket);
    Animated.parallel([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(toastTranslate, {
        toValue: 0,
        damping: 14,
        stiffness: 110,
        useNativeDriver: true,
      }),
    ]).start();

    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => {
      hideUndoToast();
    }, 5000);
  }

  function hideUndoToast() {
    Animated.parallel([
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(toastTranslate, {
        toValue: 80,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setUndoTicket(null));
  }

  function showBumpErrorToast(message: string) {
    setBumpError(message);
    Animated.timing(errorOpacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
    setTimeout(() => {
      Animated.timing(errorOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => setBumpError(null));
    }, 4000);
  }

  function handleUndoBump() {
    if (!undoTicket) return;
    // Re-add the ticket to the active list
    setTickets((prev) => {
      if (prev.some((t) => t.id === undoTicket.id)) return prev;
      return [...prev, undoTicket];
    });
    // Remove from history
    setBumpedHistory((prev) => prev.filter((t) => t.id !== undoTicket.id));
    // Best-effort: tell server to unbump
    if (identity) {
      fetch(`${ORDERS_API}/api/v1/kds/tickets/${undoTicket.id}/recall`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${identity.deviceToken}`,
        },
      }).catch(() => {
        /* non-critical */
      });
    }
    hideUndoToast();
  }

  async function handleRecall(ticket: BumpedTicket) {
    setTickets((prev) => {
      if (prev.some((t) => t.id === ticket.id)) return prev;
      return [...prev, ticket];
    });
    setBumpedHistory((prev) => prev.filter((t) => t.id !== ticket.id));
    setShowRecall(false);
    // Best-effort: tell server to recall
    if (identity) {
      try {
        await fetch(`${ORDERS_API}/api/v1/kds/tickets/${ticket.id}/recall`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${identity.deviceToken}`,
          },
        });
      } catch {
        /* non-critical */
      }
    }
  }

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
      toast.error('Update Check Failed', 'Could not reach the update server. Check your network connection.');
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
    if (!identity || !effectiveLocationId) return;
    const wsBase = ORDERS_API.replace(/^http/, 'ws');
    const url = `${wsBase}/api/v1/kds/stream?locationId=${effectiveLocationId}`;
    const myVersion = ++connectionVersion.current;

    try {
      const ws = new WebSocket(url, undefined);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted.current || myVersion !== connectionVersion.current) return;
        setConnected(true);
        setError(null);
        reconnectAttempt.current = 0;
        // Clear existing tickets on fresh connect (e.g., after location switch)
        setTickets([]);
        // Send auth
        ws.send(JSON.stringify({ type: 'auth', token: identity.deviceToken }));
      };

      ws.onmessage = (event) => {
        if (!isMounted.current || myVersion !== connectionVersion.current) return;
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
        if (!isMounted.current || myVersion !== connectionVersion.current) return;
        setConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        if (!isMounted.current || myVersion !== connectionVersion.current) return;
        setError('Connection error');
        setConnected(false);
      };
    } catch (err) {
      setError('Failed to connect');
      scheduleReconnect();
    }
  }, [identity, effectiveLocationId]);

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

  /**
   * Best-effort: ask the server to dispatch a "your order is ready" SMS to
   * the customer attached to a bumped ticket. Failures are non-blocking and
   * surfaced to the operator via the same bump-error toast strip.
   */
  async function dispatchReadySms(ticket: KdsTicket): Promise<void> {
    if (!smsConfig.enabled) return;
    const to = normaliseMobile(ticket.customerPhone);
    if (!to) return; // ticket has no usable phone number
    const endpoint = smsConfig.endpoint?.trim();
    if (!endpoint || !identity) return;

    const body = renderSmsBody(smsConfig.template, {
      name: ticket.customerName,
      order: ticket.orderNumber,
      merchant: smsConfig.merchantName,
    });

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${identity.deviceToken}`,
        },
        body: JSON.stringify({
          to,
          body,
          from: smsConfig.fromName || smsConfig.merchantName || 'POS',
          orderId: ticket.id,
          orderNumber: ticket.orderNumber,
        }),
      });
      if (!res.ok) {
        showBumpErrorToast(`SMS failed (${res.status}). Order still bumped.`);
        return;
      }
      await recordSmsSend();
    } catch {
      showBumpErrorToast('SMS network error. Order still bumped.');
    }
  }

  async function handleBump(ticketId: string) {
    if (!identity) return;

    // Capture ticket data before removal for label printing & history
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return;

    // Optimistic removal
    setTickets((prev) => prev.filter((t) => t.id !== ticketId));

    // Add to bumped history (keep last 30)
    setBumpedHistory((prev) =>
      [{ ...ticket, bumpedAt: Date.now() }, ...prev].slice(0, 30),
    );

    // Show undo toast immediately
    showUndoToast(ticket);

    let serverOk = true;
    try {
      const res = await fetch(`${ORDERS_API}/api/v1/kds/tickets/${ticketId}/bump`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${identity.deviceToken}`,
        },
      });
      if (!res.ok) {
        serverOk = false;
        showBumpErrorToast(`Bump failed (${res.status}). Will retry on reconnect.`);
      }
    } catch (err) {
      serverOk = false;
      console.warn('[KDS] Bump API call failed for ticket', ticketId);
      showBumpErrorToast('Bump failed: network error. Will retry on reconnect.');
    }

    // Print label if enabled
    if (printOnBumpEffective && serverOk) {
      try {
        const itemLines = ticket.items.map((i) => `${i.qty}x ${i.name}`).join('\n');
        const label = `ORDER #${ticket.orderNumber}\n-----------\n${itemLines}\n-----------\n\n`;
        await printText(label);
      } catch (e) {
        console.warn('[KDS] Label print failed:', e);
        showBumpErrorToast('Label printer error');
      }
    }

    // Notify customer via SMS if enabled and phone available
    if (serverOk) {
      void dispatchReadySms(ticket);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Kitchen Display</Text>
          {availableLocations.length > 1 && effectiveLocationId && (
            <Text style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
              {availableLocations.find((l) => l.id === effectiveLocationId)?.name ?? ''}
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={[styles.connDot, { backgroundColor: connected ? '#22c55e' : '#ef4444' }]} />
          <Text style={styles.connLabel}>{connected ? 'Live' : 'Reconnecting...'}</Text>
          <TouchableOpacity
            onPress={() => setExpoMode((m) => !m)}
            style={[styles.expoToggle, expoMode && styles.expoToggleActive]}
            activeOpacity={0.85}
          >
            <Text style={[styles.expoToggleText, expoMode && styles.expoToggleTextActive]}>
              EXPO
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowRecall(true)}
            style={styles.gearBtn}
            activeOpacity={0.7}
          >
            <Text style={[styles.gearIcon, { fontSize: 18 }]}>↺</Text>
            {bumpedHistory.length > 0 && (
              <View style={styles.recallBadge}>
                <Text style={styles.recallBadgeText}>{bumpedHistory.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(kds)/settings' as never)}
            style={styles.gearBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.gearIcon}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Station Filter Chips ── */}
      <View style={styles.stationBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stationScroll}
        >
          {STATIONS.map((s) => {
            const active = activeStation === s.id;
            const count = stationCounts[s.id] ?? 0;
            return (
              <TouchableOpacity
                key={s.id}
                onPress={() => setActiveStation(s.id)}
                activeOpacity={0.85}
                style={[
                  styles.stationChip,
                  active && {
                    backgroundColor: `${s.color}25`,
                    borderColor: s.color,
                  },
                ]}
              >
                <View
                  style={[
                    styles.stationDot,
                    { backgroundColor: s.color },
                  ]}
                />
                <Text
                  style={[
                    styles.stationChipText,
                    active && { color: s.color, fontWeight: '900' },
                  ]}
                >
                  {s.label}
                </Text>
                {count > 0 && (
                  <View
                    style={[
                      styles.stationChipBadge,
                      active && { backgroundColor: s.color },
                    ]}
                  >
                    <Text
                      style={[
                        styles.stationChipBadgeText,
                        active && { color: '#000' },
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Settings / Update Modal */}
      <Modal visible={showSettings} transparent animationType="fade" onRequestClose={() => setShowSettings(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Settings</Text>
            <ScrollView style={{ maxHeight: '80%' }} showsVerticalScrollIndicator={false}>

            {/* ── Active Location ── */}
            {availableLocations.length > 1 && (
              <>
                <Text style={{ color: '#888', fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 1 }}>ACTIVE LOCATION</Text>
                <View style={styles.modalCard}>
                  {availableLocations.map((loc, i) => {
                    const selected = effectiveLocationId === loc.id;
                    const isDevicePrimary = loc.id === identity?.locationId;
                    return (
                      <React.Fragment key={loc.id}>
                        {i > 0 && <View style={styles.modalDivider} />}
                        <TouchableOpacity
                          style={styles.modalRow}
                          onPress={() => handleSwitchLocation(loc.id)}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.modalLabel, selected && { color: '#6366f1', fontWeight: '700' }]} numberOfLines={1}>
                              {loc.name}
                            </Text>
                            {isDevicePrimary && (
                              <Text style={{ color: '#555', fontSize: 10, marginTop: 2 }}>Device home</Text>
                            )}
                          </View>
                          {selected && <Text style={{ color: '#6366f1', fontSize: 16, fontWeight: '900' }}>✓</Text>}
                        </TouchableOpacity>
                      </React.Fragment>
                    );
                  })}
                </View>
              </>
            )}

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

            {/* ── Label Printer ── */}
            <Text style={{ color: '#888', fontSize: 11, fontWeight: '700', marginTop: 14, marginBottom: 6, letterSpacing: 1 }}>LABEL PRINTER</Text>
            <View style={styles.modalCard}>
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Printer</Text>
                <Text style={styles.modalValue} numberOfLines={1}>
                  {printerConfig.type ? `${printerConfig.name || 'Unnamed'}` : 'Not configured'}
                </Text>
              </View>
              {printerConfig.type ? (
                <>
                  <View style={styles.modalDivider} />
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Connection</Text>
                    <Text style={styles.modalValue}>{printerConfig.type.toUpperCase()}</Text>
                  </View>
                  <View style={styles.modalDivider} />
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Paper Width</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {[58, 80].map((w) => (
                        <TouchableOpacity
                          key={w}
                          onPress={() => setPrinterConfig({ paperWidth: w as 58 | 80 })}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 6,
                            backgroundColor: printerConfig.paperWidth === w ? '#6366f1' : '#222',
                          }}
                        >
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{w}mm</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TouchableOpacity
                style={[styles.printerBtn, { flex: 1 }]}
                onPress={() => handleDiscoverPrinters('usb')}
                disabled={discovering}
                activeOpacity={0.85}
              >
                {discovering ? (
                  <ActivityIndicator size="small" color="#ccc" />
                ) : (
                  <Text style={styles.printerBtnText}>Scan USB</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.printerBtn, { flex: 1 }]}
                onPress={() => handleDiscoverPrinters('bluetooth')}
                disabled={discovering}
                activeOpacity={0.85}
              >
                <Text style={styles.printerBtnText}>Scan BT</Text>
              </TouchableOpacity>
            </View>

            {discoveredPrinters.length > 0 && (
              <View style={[styles.modalCard, { marginBottom: 12 }]}>
                {discoveredPrinters.map((p, i) => (
                  <React.Fragment key={p.id}>
                    {i > 0 && <View style={styles.modalDivider} />}
                    <TouchableOpacity
                      style={styles.modalRow}
                      onPress={() => handleSelectPrinter(p)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.modalLabel, { color: '#ccc', flex: 1 }]} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={{ color: '#6366f1', fontSize: 12, fontWeight: '700' }}>USE</Text>
                    </TouchableOpacity>
                  </React.Fragment>
                ))}
              </View>
            )}

            {printerConfig.type ? (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <TouchableOpacity
                  style={[styles.printerBtn, { flex: 1, backgroundColor: '#22c55e22', borderColor: '#22c55e55' }]}
                  onPress={handleTestPrinter}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.printerBtnText, { color: '#22c55e' }]}>Test Print</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.printerBtn, { flex: 1, backgroundColor: '#ef444422', borderColor: '#ef444455' }]}
                  onPress={handleClearPrinter}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.printerBtnText, { color: '#ef4444' }]}>Clear</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* ── SMS on Bump ── */}
            <Text style={{ color: '#888', fontSize: 11, fontWeight: '700', marginTop: 14, marginBottom: 6, letterSpacing: 1 }}>SMS ON BUMP</Text>
            <View style={styles.modalCard}>
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Send SMS when bumped</Text>
                <Switch
                  value={smsConfig.enabled}
                  onValueChange={(v) => setSmsConfig({ enabled: v })}
                  trackColor={{ false: '#2a2a2a', true: '#22c55e80' }}
                  thumbColor={smsConfig.enabled ? '#22c55e' : '#555'}
                />
              </View>
              {smsConfig.enabled && (
                <>
                  <View style={styles.modalDivider} />
                  <View style={[styles.modalRow, { paddingVertical: 10 }]}>
                    <Text style={styles.modalLabel}>Merchant name</Text>
                    <TextInput
                      style={styles.smsInput}
                      value={smsConfig.merchantName}
                      onChangeText={(t) => setSmsConfig({ merchantName: t })}
                      placeholder="e.g. The Boatshed"
                      placeholderTextColor="#444"
                    />
                  </View>
                  <View style={styles.modalDivider} />
                  <View style={[styles.modalRow, { paddingVertical: 10 }]}>
                    <Text style={styles.modalLabel}>Sender ID</Text>
                    <TextInput
                      style={styles.smsInput}
                      value={smsConfig.fromName}
                      onChangeText={(t) => setSmsConfig({ fromName: t })}
                      placeholder="Max 11 chars"
                      placeholderTextColor="#444"
                      maxLength={11}
                    />
                  </View>
                  <View style={styles.modalDivider} />
                  <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                    <Text style={[styles.modalLabel, { marginBottom: 6 }]}>
                      Message template
                    </Text>
                    <TextInput
                      style={styles.smsTemplateInput}
                      value={smsConfig.template}
                      onChangeText={(t) => setSmsConfig({ template: t })}
                      placeholder="Hi {name}, your order #{order} is ready."
                      placeholderTextColor="#444"
                      multiline
                      numberOfLines={3}
                    />
                    <Text style={{ color: '#444', fontSize: 10, marginTop: 4 }}>
                      Placeholders: {'{name}'}, {'{order}'}, {'{merchant}'}
                    </Text>
                  </View>
                  <View style={styles.modalDivider} />
                  <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                    <Text style={[styles.modalLabel, { marginBottom: 6 }]}>
                      Gateway endpoint
                    </Text>
                    <TextInput
                      style={[styles.smsTemplateInput, { fontSize: 11 }]}
                      value={smsConfig.endpoint}
                      onChangeText={(t) => setSmsConfig({ endpoint: t })}
                      placeholder="https://api.example.com/sms/send"
                      placeholderTextColor="#444"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  {smsConfig.totalSent > 0 && (
                    <>
                      <View style={styles.modalDivider} />
                      <View style={styles.modalRow}>
                        <Text style={styles.modalLabel}>Total sent</Text>
                        <Text style={[styles.modalValue, { color: '#22c55e', fontWeight: '700' }]}>
                          {smsConfig.totalSent}
                        </Text>
                      </View>
                    </>
                  )}
                </>
              )}
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
              onPress={async () => {
                const ok = await confirm({
                  title: 'Unpair Device',
                  description: 'This will remove all credentials. You will need to pair again.',
                  confirmLabel: 'Unpair',
                  destructive: true,
                });
                if (ok) {
                  const { clearIdentity } = useDeviceStore.getState();
                  await clearIdentity();
                  setShowSettings(false);
                }
              }}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#ef4444' }}>Unpair Device</Text>
            </TouchableOpacity>

            </ScrollView>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowSettings(false)} activeOpacity={0.85}>
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* Left: Order Summary Sidebar (K4) */}
        {visibleTickets.length > 0 && (
          <View style={{ width: 180, backgroundColor: '#111', borderRightWidth: 1, borderRightColor: '#222', paddingTop: 12 }}>
            <Text style={{ color: '#888', fontSize: 11, fontWeight: '700', paddingHorizontal: 12, marginBottom: 8, letterSpacing: 1 }}>TO MAKE</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {orderSummary.slice(0, 10).map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: '#f59e0b', minWidth: 30 }}>{item.qty}x</Text>
                  <Text style={{ fontSize: 13, color: '#ccc', fontWeight: '600', flex: 1 }} numberOfLines={1}>{item.name}</Text>
                </View>
              ))}
              {orderSummary.length > 10 && (
                <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 12, color: '#555', fontStyle: 'italic' }}>...and {orderSummary.length - 10} more</Text>
                </View>
              )}
            </ScrollView>
            <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#222' }}>
              <Text style={{ color: '#555', fontSize: 11 }}>{visibleTickets.length} orders · {orderSummary.reduce((s, i) => s + i.qty, 0)} items</Text>
            </View>
          </View>
        )}

        {/* Right: Ticket Grid */}
        {visibleTickets.length === 0 ? (
          <View style={styles.clearKitchen}>
            <Text style={styles.clearEmoji}>✅</Text>
            <Text style={styles.clearTitle}>
              {tickets.length === 0 ? 'Kitchen Clear' : 'No tickets for this station'}
            </Text>
            <Text style={styles.clearSub}>
              {tickets.length === 0 ? 'No pending tickets' : 'Switch filter to see other stations'}
            </Text>
          </View>
        ) : expoMode ? (
          <View style={{ flex: 1 }}>
            {/* Station progress strip */}
            <View style={styles.expoStrip}>
              {STATIONS.filter((s) => s.id !== 'all').map((s) => {
                const prog = stationProgress[s.id] ?? { ready: 0, pending: 0 };
                const total = prog.ready + prog.pending;
                const pct = total === 0 ? 0 : Math.round((prog.ready / total) * 100);
                return (
                  <View key={s.id} style={styles.expoStripCell}>
                    <View
                      style={[
                        styles.expoStripDot,
                        { backgroundColor: s.color },
                      ]}
                    />
                    <Text style={styles.expoStripLabel}>{s.label}</Text>
                    <Text style={[styles.expoStripCount, { color: s.color }]}>
                      {prog.ready}/{total}
                    </Text>
                    <View style={styles.expoStripBarBg}>
                      <View
                        style={[
                          styles.expoStripBar,
                          { width: `${pct}%`, backgroundColor: s.color },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>

            <FlatList
              data={visibleTickets}
              keyExtractor={(t) => t.id}
              numColumns={2}
              contentContainerStyle={styles.ticketGrid}
              renderItem={({ item }) => (
                <ExpoTicketCard
                  ticket={item}
                  isItemReady={isItemReady}
                  onToggleItem={toggleItemReady}
                  onBump={handleBump}
                  allReady={isTicketAllReady(item)}
                />
              )}
              style={{ flex: 1 }}
              extraData={itemReady}
            />
          </View>
        ) : (
          <FlatList
            data={visibleTickets}
            keyExtractor={(t) => t.id}
            numColumns={kdsSettings?.itemsPerRow ?? 3}
            key={kdsSettings?.itemsPerRow ?? 3}
            contentContainerStyle={styles.ticketGrid}
            renderItem={({ item }) => <TicketCard ticket={item} onBump={handleBump} />}
            style={{ flex: 1 }}
          />
        )}
      </View>

      {/* ── Recall Panel Modal ── */}
      <Modal
        visible={showRecall}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRecall(false)}
      >
        <View style={styles.recallOverlay}>
          <View style={styles.recallSheet}>
            <View style={styles.recallHeader}>
              <Text style={styles.recallTitle}>Recall Bumped Tickets</Text>
              <TouchableOpacity
                onPress={() => setShowRecall(false)}
                style={styles.recallClose}
              >
                <Text style={{ color: '#888', fontSize: 22 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.recallSub}>
              Recently bumped tickets — tap to bring back
            </Text>

            {bumpedHistory.length === 0 ? (
              <View style={styles.recallEmpty}>
                <Text style={styles.recallEmptyEmoji}>🍽️</Text>
                <Text style={styles.recallEmptyText}>No bumped tickets yet</Text>
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: 480 }}
                showsVerticalScrollIndicator={false}
              >
                {bumpedHistory.map((t) => {
                  const elapsed = Math.floor((Date.now() - t.bumpedAt) / 1000);
                  const elapsedMin = Math.floor(elapsed / 60);
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={styles.recallRow}
                      onPress={() => handleRecall(t)}
                      activeOpacity={0.85}
                    >
                      <View style={{ flex: 1 }}>
                        <View
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                        >
                          <Text style={styles.recallOrderNumber}>#{t.orderNumber}</Text>
                          <View
                            style={[
                              styles.channelBadge,
                              {
                                backgroundColor: `${getChannelColor(t.channel)}22`,
                                borderColor: `${getChannelColor(t.channel)}55`,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.channelText,
                                { color: getChannelColor(t.channel) },
                              ]}
                            >
                              {t.channel.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.recallItems} numberOfLines={2}>
                          {t.items.map((i) => `${i.qty}x ${i.name}`).join(' · ')}
                        </Text>
                        <Text style={styles.recallTime}>
                          Bumped {elapsedMin === 0 ? 'just now' : `${elapsedMin}m ago`}
                        </Text>
                      </View>
                      <View style={styles.recallBtn}>
                        <Text style={styles.recallBtnText}>RECALL</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Undo Bump Toast ── */}
      {undoTicket && (
        <Animated.View
          style={[
            styles.toast,
            {
              opacity: toastOpacity,
              transform: [{ translateY: toastTranslate }],
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.toastInner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toastTitle}>
                Bumped #{undoTicket.orderNumber}
              </Text>
              <Text style={styles.toastSub} numberOfLines={1}>
                {undoTicket.items.map((i) => `${i.qty}x ${i.name}`).join(' · ')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleUndoBump}
              activeOpacity={0.85}
              style={styles.toastUndoBtn}
            >
              <Text style={styles.toastUndoText}>UNDO</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* ── Bump Error Toast ── */}
      {bumpError && (
        <Animated.View
          style={[styles.errorToast, { opacity: errorOpacity }]}
          pointerEvents="none"
        >
          <Text style={styles.errorToastIcon}>⚠</Text>
          <Text style={styles.errorToastText}>{bumpError}</Text>
        </Animated.View>
      )}
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
  modalContent: { backgroundColor: '#141414', borderRadius: 20, padding: 24, width: 380, maxWidth: '90%', maxHeight: '90%', borderWidth: 1, borderColor: '#2a2a2a' },
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

  // Printer config buttons
  printerBtn: {
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  printerBtnText: { fontSize: 13, fontWeight: '700', color: '#ccc' },

  // SMS settings inputs
  smsInput: {
    flex: 1,
    maxWidth: 180,
    backgroundColor: '#0d0d0d',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#ddd',
    fontSize: 12,
    borderWidth: 1,
    borderColor: '#222',
    textAlign: 'right',
  },
  smsTemplateInput: {
    backgroundColor: '#0d0d0d',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#ddd',
    fontSize: 12,
    borderWidth: 1,
    borderColor: '#222',
    minHeight: 60,
    textAlignVertical: 'top',
  },

  // ── Recall icon badge in header ──
  recallBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#0a0a0a',
  },
  recallBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#000',
  },

  // ── Station filter chip bar ──
  stationBar: {
    backgroundColor: '#0d0d0d',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    paddingVertical: 10,
  },
  stationScroll: {
    paddingHorizontal: 14,
    gap: 8,
  },
  stationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#222',
    backgroundColor: '#141414',
    marginRight: 8,
  },
  stationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stationChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#bbb',
    letterSpacing: 0.3,
  },
  stationChipBadge: {
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  stationChipBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#888',
  },

  // ── Expeditor mode ──
  expoToggle: {
    marginLeft: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    backgroundColor: '#141414',
  },
  expoToggleActive: {
    backgroundColor: '#a78bfa',
    borderColor: '#a78bfa',
  },
  expoToggleText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#888',
    letterSpacing: 1,
  },
  expoToggleTextActive: {
    color: '#000',
  },
  expoStrip: {
    flexDirection: 'row',
    backgroundColor: '#0d0d0d',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    padding: 10,
    gap: 10,
  },
  expoStripCell: {
    flex: 1,
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222',
    padding: 10,
    alignItems: 'center',
  },
  expoStripDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 4,
  },
  expoStripLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  expoStripCount: {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 6,
  },
  expoStripBarBg: {
    width: '100%',
    height: 4,
    backgroundColor: '#1f1f1f',
    borderRadius: 2,
    overflow: 'hidden',
  },
  expoStripBar: {
    height: 4,
    borderRadius: 2,
  },
  expoCard: {
    flex: 1,
    backgroundColor: '#141414',
    borderRadius: 16,
    margin: 6,
    borderTopWidth: 4,
    borderTopColor: '#22c55e',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    overflow: 'hidden',
    minWidth: 280,
  },
  expoCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  expoProgress: {
    fontSize: 13,
    fontWeight: '900',
    color: '#a78bfa',
    backgroundColor: '#a78bfa22',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  expoItems: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  expoItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: '#1a1a1a',
    gap: 6,
  },
  expoItemRowReady: {
    backgroundColor: '#0f1f15',
    opacity: 0.78,
  },
  expoCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  expoCheckMark: {
    color: '#000',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 16,
  },
  expoItemQty: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
    minWidth: 28,
  },
  expoItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#eee',
  },
  expoItemMods: {
    fontSize: 11,
    color: '#888',
    marginTop: 1,
  },
  expoItemStation: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginLeft: 6,
  },
  expoItemTextReady: {
    textDecorationLine: 'line-through',
    color: '#5a7a64',
  },
  expoBumpBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  expoBumpReady: {
    backgroundColor: '#22c55e',
  },
  expoBumpWaiting: {
    backgroundColor: '#1e1e1e',
  },

  // ── Recall panel modal ──
  recallOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  recallSheet: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    maxHeight: '85%',
  },
  recallHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  recallTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.3,
  },
  recallClose: {
    padding: 6,
  },
  recallSub: {
    fontSize: 13,
    color: '#666',
    marginBottom: 18,
  },
  recallEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  recallEmptyEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  recallEmptyText: {
    fontSize: 14,
    color: '#555',
    fontWeight: '600',
  },
  recallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  recallOrderNumber: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
  },
  recallItems: {
    fontSize: 13,
    color: '#999',
    marginTop: 6,
    lineHeight: 18,
  },
  recallTime: {
    fontSize: 11,
    color: '#555',
    marginTop: 4,
    fontWeight: '600',
  },
  recallBtn: {
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginLeft: 12,
  },
  recallBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 0.5,
  },

  // ── Undo bump toast ──
  toast: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  toastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    maxWidth: 520,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  toastTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 2,
  },
  toastSub: {
    fontSize: 12,
    color: '#888',
  },
  toastUndoBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginLeft: 12,
  },
  toastUndoText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 0.5,
  },

  // ── Bump error toast ──
  errorToast: {
    position: 'absolute',
    bottom: 110,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(239,68,68,0.16)',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignSelf: 'center',
  },
  errorToastIcon: {
    fontSize: 18,
    color: '#ef4444',
  },
  errorToastText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fca5a5',
    flexShrink: 1,
  },
});
