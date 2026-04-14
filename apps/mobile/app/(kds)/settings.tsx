import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Audio } from 'expo-av';
import { confirm, toast } from '../../components/ui';
import { useDeviceStore } from '../../store/device';
import { usePrinterStore, type PrinterConnectionType } from '../../store/printers';
import {
  printTestPage,
  discoverPrinters,
  type DiscoveredPrinter,
} from '../../lib/printer';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const DOWNLOADS_API =
  process.env['EXPO_PUBLIC_STOREFRONT_URL']
    ? `${process.env['EXPO_PUBLIC_STOREFRONT_URL'].replace(/\/+$/, '')}/api/downloads/latest`
    : 'https://elevatedpos.com.au/api/downloads/latest';

const KDS_SETTINGS_KEY = 'kds_settings';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type BeepType = 'ding' | 'double_ding' | 'triple_ding';
export type ViewMode = 'station' | 'expeditor';

export interface KdsSettings {
  /** Sound on/off */
  soundEnabled: boolean;
  /** Which beep to play for new orders */
  beepType: BeepType;
  /**
   * Seconds between repeated beeps while there are pending tickets.
   * null = only beep once when the ticket first arrives (original behaviour).
   */
  beepIntervalSeconds: number | null;
  /** Custom display name for this KDS station */
  stationName: string;
  /** Default view mode */
  viewMode: ViewMode;
  /** Number of ticket columns in station view */
  itemsPerRow: 2 | 3 | 4;
  /** Print label automatically when ticket is bumped */
  printOnBump: boolean;
}

export const BEEP_URLS: Record<BeepType, string> = {
  ding: 'https://cdn.elevatedpos.com.au/sounds/beep.mp3',
  double_ding: 'https://cdn.elevatedpos.com.au/sounds/beep-double.mp3',
  triple_ding: 'https://cdn.elevatedpos.com.au/sounds/beep-triple.mp3',
};

const BEEP_LABELS: Record<BeepType, string> = {
  ding: 'Ding',
  double_ding: 'Double Ding',
  triple_ding: 'Triple Ding',
};

const DEFAULT_SETTINGS: KdsSettings = {
  soundEnabled: true,
  beepType: 'ding',
  beepIntervalSeconds: null,
  stationName: '',
  viewMode: 'station',
  itemsPerRow: 3,
  printOnBump: false,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export async function loadKdsSettings(): Promise<KdsSettings> {
  try {
    const raw = await AsyncStorage.getItem(KDS_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as KdsSettings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveKdsSettings(settings: KdsSettings): Promise<void> {
  await AsyncStorage.setItem(KDS_SETTINGS_KEY, JSON.stringify(settings));
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function KDSSettingsScreen() {
  const router = useRouter();
  const identity = useDeviceStore((s) => s.identity);
  const { config: printerConfig, setConfig: setPrinterConfig, hydrate: hydratePrinter } = usePrinterStore();

  // Local settings state (persisted to AsyncStorage under kds_settings)
  const [settings, setSettings] = useState<KdsSettings>({ ...DEFAULT_SETTINGS });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Label printer
  const [discovering, setDiscovering] = useState(false);
  const [discoveredPrinters, setDiscoveredPrinters] = useState<DiscoveredPrinter[]>([]);
  const [networkAddress, setNetworkAddress] = useState('');

  // Update check
  const [updateChecking, setUpdateChecking] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [updateUrl, setUpdateUrl] = useState<string | null>(null);
  const [updateChangelog, setUpdateChangelog] = useState<string[]>([]);

  // Load settings on mount
  useEffect(() => {
    hydratePrinter();
    loadKdsSettings().then((s) => {
      setSettings(s);
      setNetworkAddress(printerConfig.type === 'network' ? printerConfig.address : '');
      setSettingsLoaded(true);
    });
  }, [hydratePrinter]);

  // Persist settings whenever they change (after initial load)
  useEffect(() => {
    if (!settingsLoaded) return;
    saveKdsSettings(settings).catch(() => {});
  }, [settings, settingsLoaded]);

  function updateSetting<K extends keyof KdsSettings>(key: K, value: KdsSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handlePreviewBeep(beepType: BeepType) {
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: BEEP_URLS[beepType] },
        { shouldPlay: true },
      );
      setTimeout(() => sound.unloadAsync(), 3000);
    } catch {
      toast.warning('Audio', 'Could not play sound preview.');
    }
  }

  async function handleDiscoverPrinters(type: PrinterConnectionType) {
    setDiscovering(true);
    try {
      const devices = await discoverPrinters(type);
      setDiscoveredPrinters(devices);
      if (devices.length === 0) {
        toast.warning('No Printers Found', `No ${type.toUpperCase()} printers detected.`);
      }
    } catch (err) {
      toast.error('Discovery Failed', err instanceof Error ? err.message : 'Could not scan for printers');
    } finally {
      setDiscovering(false);
    }
  }

  async function handleSelectPrinter(printer: DiscoveredPrinter) {
    try {
      await setPrinterConfig({ type: printer.type, address: printer.id, name: printer.name });
      setDiscoveredPrinters([]);
      toast.success('Printer Saved', `${printer.name} will print labels when you bump orders.`);
    } catch (err) {
      toast.error('Error', err instanceof Error ? err.message : 'Could not save printer');
    }
  }

  async function handleSaveNetworkPrinter() {
    const addr = networkAddress.trim();
    if (!addr || !addr.includes(':')) {
      toast.warning('Invalid Address', 'Enter IP:Port e.g. 192.168.1.50:9100');
      return;
    }
    try {
      await setPrinterConfig({ type: 'network', address: addr, name: `Network (${addr})` });
      toast.success('Printer Saved', `Network printer at ${addr} configured.`);
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
      toast.error('Print Failed', err instanceof Error ? err.message : 'Could not print');
    }
  }

  async function handleClearPrinter() {
    await setPrinterConfig({ type: null, address: '', name: '' });
    setDiscoveredPrinters([]);
    setNetworkAddress('');
  }

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
      toast.error('Update Check Failed', 'Could not reach the update server.');
    } finally {
      setUpdateChecking(false);
    }
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

  async function handleUnpair() {
    const ok = await confirm({
      title: 'Unpair Device',
      description: 'This will remove all credentials. You will need to pair again.',
      confirmLabel: 'Unpair',
      destructive: true,
    });
    if (ok) {
      const { clearIdentity } = useDeviceStore.getState();
      await clearIdentity();
    }
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom', 'left', 'right']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#ccc" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>KDS Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Sound Settings ── */}
        <Text style={s.sectionHeader}>SOUND</Text>
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.rowLabel}>New Order Sound</Text>
            <Switch
              value={settings.soundEnabled}
              onValueChange={(v) => updateSetting('soundEnabled', v)}
              trackColor={{ false: '#2a2a2a', true: '#6366f180' }}
              thumbColor={settings.soundEnabled ? '#6366f1' : '#555'}
            />
          </View>

          {settings.soundEnabled && (
            <>
              <View style={s.divider} />
              <View style={[s.row, { flexDirection: 'column', alignItems: 'flex-start', paddingVertical: 12 }]}>
                <Text style={[s.rowLabel, { marginBottom: 10 }]}>Beep Type</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {(['ding', 'double_ding', 'triple_ding'] as BeepType[]).map((bt) => {
                    const active = settings.beepType === bt;
                    return (
                      <View key={bt} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                        <TouchableOpacity
                          style={[s.beepOption, active && s.beepOptionActive]}
                          onPress={() => updateSetting('beepType', bt)}
                          activeOpacity={0.8}
                        >
                          <Text style={[s.beepOptionText, active && s.beepOptionTextActive]}>
                            {BEEP_LABELS[bt]}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={s.previewBtn}
                          onPress={() => handlePreviewBeep(bt)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="play" size={12} color="#888" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* K5 — Repeat alert interval */}
              <View style={s.divider} />
              <View style={[s.row, { flexDirection: 'column', alignItems: 'flex-start', paddingVertical: 12 }]}>
                <Text style={[s.rowLabel, { marginBottom: 4 }]}>Repeat Alert</Text>
                <Text style={[s.rowLabel, { fontSize: 11, color: '#64748b', fontWeight: '400', marginBottom: 10 }]}>
                  Re-beep while there are pending orders
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {([
                    { label: 'Off',  value: null },
                    { label: '15 s', value: 15 },
                    { label: '30 s', value: 30 },
                    { label: '1 min', value: 60 },
                    { label: '2 min', value: 120 },
                  ] as { label: string; value: number | null }[]).map((opt) => {
                    const active = settings.beepIntervalSeconds === opt.value;
                    return (
                      <TouchableOpacity
                        key={String(opt.value)}
                        style={[s.beepOption, active && s.beepOptionActive]}
                        onPress={() => updateSetting('beepIntervalSeconds', opt.value)}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.beepOptionText, active && s.beepOptionTextActive]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </>
          )}
        </View>

        {/* ── Display Settings ── */}
        <Text style={s.sectionHeader}>DISPLAY</Text>
        <View style={s.card}>
          <View style={[s.row, { paddingVertical: 10 }]}>
            <Text style={s.rowLabel}>Station Name</Text>
            <TextInput
              style={s.textInput}
              value={settings.stationName}
              onChangeText={(t) => updateSetting('stationName', t)}
              placeholder="e.g. Grill Station"
              placeholderTextColor="#444"
              maxLength={32}
            />
          </View>

          <View style={s.divider} />

          <View style={[s.row, { flexDirection: 'column', alignItems: 'flex-start', paddingVertical: 12 }]}>
            <Text style={[s.rowLabel, { marginBottom: 10 }]}>Default View Mode</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['station', 'expeditor'] as ViewMode[]).map((vm) => {
                const active = settings.viewMode === vm;
                return (
                  <TouchableOpacity
                    key={vm}
                    style={[s.segBtn, active && s.segBtnActive]}
                    onPress={() => updateSetting('viewMode', vm)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.segBtnText, active && s.segBtnTextActive]}>
                      {vm === 'station' ? 'Station' : 'Expeditor'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={s.divider} />

          <View style={[s.row, { flexDirection: 'column', alignItems: 'flex-start', paddingVertical: 12 }]}>
            <Text style={[s.rowLabel, { marginBottom: 10 }]}>Tickets Per Row</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([2, 3, 4] as const).map((n) => {
                const active = settings.itemsPerRow === n;
                return (
                  <TouchableOpacity
                    key={n}
                    style={[s.segBtn, active && s.segBtnActive]}
                    onPress={() => updateSetting('itemsPerRow', n)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.segBtnText, active && s.segBtnTextActive]}>{n}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* ── Label Printer Settings ── */}
        <Text style={s.sectionHeader}>LABEL PRINTER</Text>
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.rowLabel}>Print Label on Bump</Text>
            <Switch
              value={settings.printOnBump}
              onValueChange={(v) => updateSetting('printOnBump', v)}
              trackColor={{ false: '#2a2a2a', true: '#6366f180' }}
              thumbColor={settings.printOnBump ? '#6366f1' : '#555'}
            />
          </View>

          <View style={s.divider} />

          <View style={s.row}>
            <Text style={s.rowLabel}>Current Printer</Text>
            <Text style={s.rowValue} numberOfLines={1}>
              {printerConfig.type ? (printerConfig.name || 'Unnamed') : 'Not configured'}
            </Text>
          </View>

          {printerConfig.type === 'network' || printerConfig.type === null ? (
            <>
              <View style={s.divider} />
              <View style={[s.row, { paddingVertical: 10 }]}>
                <Text style={s.rowLabel}>Network (IP:Port)</Text>
                <View style={{ flexDirection: 'row', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
                  <TextInput
                    style={[s.textInput, { flex: 1, maxWidth: 160 }]}
                    value={networkAddress}
                    onChangeText={setNetworkAddress}
                    placeholder="192.168.1.50:9100"
                    placeholderTextColor="#444"
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity style={s.smallBtn} onPress={handleSaveNetworkPrinter} activeOpacity={0.85}>
                    <Text style={s.smallBtnText}>Set</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          ) : null}

          {printerConfig.type ? (
            <>
              <View style={s.divider} />
              <View style={s.row}>
                <Text style={s.rowLabel}>Paper Width</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[58, 80].map((w) => (
                    <TouchableOpacity
                      key={w}
                      onPress={() => setPrinterConfig({ paperWidth: w as 58 | 80 })}
                      style={[s.segBtn, printerConfig.paperWidth === w && s.segBtnActive]}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.segBtnText, printerConfig.paperWidth === w && s.segBtnTextActive]}>
                        {w}mm
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          ) : null}
        </View>

        {/* Printer action buttons */}
        <View style={s.btnRow}>
          <TouchableOpacity
            style={[s.actionBtn, { flex: 1 }]}
            onPress={() => handleDiscoverPrinters('usb')}
            disabled={discovering}
            activeOpacity={0.85}
          >
            {discovering ? (
              <ActivityIndicator size="small" color="#ccc" />
            ) : (
              <Text style={s.actionBtnText}>Scan USB</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { flex: 1 }]}
            onPress={() => handleDiscoverPrinters('bluetooth')}
            disabled={discovering}
            activeOpacity={0.85}
          >
            <Text style={s.actionBtnText}>Scan Bluetooth</Text>
          </TouchableOpacity>
        </View>

        {discoveredPrinters.length > 0 && (
          <View style={[s.card, { marginBottom: 12 }]}>
            {discoveredPrinters.map((p, i) => (
              <React.Fragment key={p.id}>
                {i > 0 && <View style={s.divider} />}
                <TouchableOpacity
                  style={s.row}
                  onPress={() => handleSelectPrinter(p)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.rowLabel, { color: '#ccc', flex: 1 }]} numberOfLines={1}>{p.name}</Text>
                  <Text style={{ color: '#6366f1', fontSize: 12, fontWeight: '700' }}>USE</Text>
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>
        )}

        {printerConfig.type ? (
          <View style={s.btnRow}>
            <TouchableOpacity
              style={[s.actionBtn, { flex: 1, backgroundColor: '#22c55e22', borderColor: '#22c55e55' }]}
              onPress={handleTestPrinter}
              activeOpacity={0.85}
            >
              <Text style={[s.actionBtnText, { color: '#22c55e' }]}>Test Print</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, { flex: 1, backgroundColor: '#ef444422', borderColor: '#ef444455' }]}
              onPress={handleClearPrinter}
              activeOpacity={0.85}
            >
              <Text style={[s.actionBtnText, { color: '#ef4444' }]}>Clear Printer</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Device & Updates ── */}
        <Text style={s.sectionHeader}>DEVICE</Text>
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.rowLabel}>App Version</Text>
            <Text style={s.rowValue}>{APP_VERSION}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.rowLabel}>Latest Version</Text>
            {updateChecking ? (
              <ActivityIndicator size="small" color="#f59e0b" />
            ) : (
              <Text style={[s.rowValue, isUpdateAvailable() && { color: '#f59e0b', fontWeight: '700' }]}>
                {latestVersion ?? '—'}
              </Text>
            )}
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.rowLabel}>Role</Text>
            <Text style={s.rowValue}>KDS</Text>
          </View>
          {identity ? (
            <>
              <View style={s.divider} />
              <View style={s.row}>
                <Text style={s.rowLabel}>Device ID</Text>
                <Text style={s.rowValue}>{identity.deviceId.slice(0, 12)}…</Text>
              </View>
              {settings.stationName ? (
                <>
                  <View style={s.divider} />
                  <View style={s.row}>
                    <Text style={s.rowLabel}>Station</Text>
                    <Text style={s.rowValue}>{settings.stationName}</Text>
                  </View>
                </>
              ) : null}
            </>
          ) : null}
        </View>

        {isUpdateAvailable() && updateUrl ? (
          <TouchableOpacity
            style={s.updateBtn}
            onPress={() => Linking.openURL(updateUrl!)}
            activeOpacity={0.85}
          >
            <Text style={s.updateBtnText}>Download Update v{latestVersion}</Text>
          </TouchableOpacity>
        ) : !updateChecking && latestVersion ? (
          <View style={s.upToDate}>
            <Text style={s.upToDateText}>Up to date</Text>
          </View>
        ) : null}

        {updateChangelog.length > 0 && isUpdateAvailable() && (
          <View style={s.changelog}>
            {updateChangelog.map((entry, i) => (
              <Text key={i} style={s.changelogItem}>{entry}</Text>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={s.checkBtn}
          onPress={checkForUpdate}
          disabled={updateChecking}
          activeOpacity={0.85}
        >
          <Text style={s.checkBtnText}>Check for Updates</Text>
        </TouchableOpacity>

        {/* ── Unpair ── */}
        <TouchableOpacity
          style={s.unpairBtn}
          onPress={handleUnpair}
          activeOpacity={0.85}
        >
          <Text style={s.unpairBtnText}>Unpair Device</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },

  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  sectionHeader: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
  },

  card: {
    backgroundColor: '#1a1a2a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    marginBottom: 16,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  divider: { height: 1, backgroundColor: '#2a2a3a', marginHorizontal: 16 },

  rowLabel: { fontSize: 13, color: '#888' },
  rowValue: { fontSize: 13, color: '#ccc', fontWeight: '500' },

  textInput: {
    backgroundColor: '#0d0d14',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    color: '#ddd',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    textAlign: 'right',
    minWidth: 140,
  },

  smallBtn: {
    backgroundColor: '#6366f122',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#6366f155',
  },
  smallBtnText: { color: '#6366f1', fontSize: 12, fontWeight: '700' },

  beepOption: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#333',
  },
  beepOptionActive: { backgroundColor: '#6366f122', borderColor: '#6366f1' },
  beepOptionText: { fontSize: 12, color: '#888', fontWeight: '600' },
  beepOptionTextActive: { color: '#6366f1' },

  previewBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#1e1e2e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },

  segBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#333',
    minWidth: 60,
    alignItems: 'center',
  },
  segBtnActive: { backgroundColor: '#6366f122', borderColor: '#6366f1' },
  segBtnText: { fontSize: 13, color: '#888', fontWeight: '600' },
  segBtnTextActive: { color: '#6366f1', fontWeight: '800' },

  btnRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  actionBtn: {
    backgroundColor: '#1e1e2e',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: '#ccc' },

  updateBtn: {
    backgroundColor: '#f59e0b',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 10,
  },
  updateBtnText: { fontSize: 15, fontWeight: '700', color: '#000' },

  upToDate: {
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  upToDateText: { fontSize: 14, color: '#22c55e', fontWeight: '600' },

  changelog: { backgroundColor: '#1a1a2a', borderRadius: 10, padding: 12, marginBottom: 10 },
  changelogItem: { fontSize: 12, color: '#999', lineHeight: 18 },

  checkBtn: {
    backgroundColor: '#1e1e2e',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  checkBtnText: { fontSize: 14, fontWeight: '600', color: '#ccc' },

  unpairBtn: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  unpairBtnText: { fontSize: 14, fontWeight: '700', color: '#ef4444' },
});
