/**
 * Kiosk Staff Settings (v2.7.40, v2.7.80)
 *
 * Hidden settings page for staff. NOT accessible from the customer-facing
 * kiosk nav. To reach it:
 *
 *   1. On ANY kiosk screen, tap 7 times (within 4 seconds) on the small
 *      "E" badge in the TOP-LEFT corner. The badge sits in
 *      `(kiosk)/_layout.tsx` as a global floating overlay so it is
 *      reachable regardless of which customer screen (attract / menu /
 *      cart / payment / confirmation) is currently on top. v2.7.80 —
 *      bumped from 5→7 taps + the badge is now visible so staff can
 *      find it without memorising a corner.
 *   2. The gesture navigates to THIS page, which then challenges the
 *      operator with a 4-digit PIN gate (default `1234`).
 *
 * The PIN is deliberately simple — the goal is "not discoverable by
 * customers", not hardening against a malicious staff member. If/when the
 * server exposes a per-device staff PIN in the device-config, wire that in
 * here instead of the hard-coded default.
 *
 * Sections rendered after PIN unlock:
 *   - Device Info  (role / merchant / location / register / terminal)
 *   - Till         (Open Till / Close Till — reuses POS flows)
 *   - Printer      (current status + Scan USB + Test + Advanced modal)
 *   - Sync         (re-pulls server device config + menu)
 *   - Unpair       (clears device identity, returns to /pair)
 *
 * Visual language: dark theme, matching the POS More page almost verbatim
 * so the same merchant can service either a POS or a Kiosk without
 * re-learning the controls.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import Constants from 'expo-constants';
import { confirm, toast } from '../../components/ui';
import { useDeviceStore } from '../../store/device';
import { useDeviceSettings } from '../../store/device-settings';
import { usePrinterStore, type PrinterConnectionType } from '../../store/printers';
import { useTillStore } from '../../store/till';
import { useCatalogStore } from '../../store/catalog';
import {
  connectPrinter,
  discoverPrinters,
  printTestPage,
  type DiscoveredPrinter,
} from '../../lib/printer';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const STAFF_PIN = '1234';

function truncate(str: string | null | undefined, len = 16): string {
  if (!str) return '—';
  return str.length > len ? `${str.slice(0, len)}...` : str;
}

export default function KioskSettingsScreen() {
  const router = useRouter();
  const { identity, clearIdentity } = useDeviceStore();
  const serverConfig = useDeviceSettings((s) => s.config);

  /* ── PIN gate ──────────────────────────────────────────────────── */
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  function tryUnlock(pin: string) {
    if (pin === STAFF_PIN) {
      setUnlocked(true);
      setPinError(false);
      setPinInput('');
    } else {
      setPinError(true);
      setPinInput('');
    }
  }

  function handlePinKey(digit: string) {
    if (digit === 'clear') {
      setPinInput('');
      setPinError(false);
      return;
    }
    if (digit === 'back') {
      setPinInput((p) => p.slice(0, -1));
      setPinError(false);
      return;
    }
    const next = (pinInput + digit).slice(0, 4);
    setPinInput(next);
    setPinError(false);
    if (next.length === 4) {
      // Defer so the 4th dot paints before the failed-state shake.
      setTimeout(() => tryUnlock(next), 120);
    }
  }

  /* ── Printer ───────────────────────────────────────────────────── */
  const { config: printerConfig, setConfig: setPrinterConfig } = usePrinterStore();
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [editPrinter, setEditPrinter] = useState({
    type: null as PrinterConnectionType | null,
    address: '',
    name: '',
    paperWidth: 80 as 58 | 80,
    autoPrint: false,
  });
  const [discovering, setDiscovering] = useState(false);
  const [discoveredPrinters, setDiscoveredPrinters] = useState<DiscoveredPrinter[]>([]);
  const [printerConnected, setPrinterConnected] = useState(false);

  function openPrinterModal() {
    setEditPrinter({
      type: printerConfig.type,
      address: printerConfig.address,
      name: printerConfig.name,
      paperWidth: printerConfig.paperWidth,
      autoPrint: printerConfig.autoPrint,
    });
    setShowPrinterModal(true);
  }

  async function savePrinterConfig() {
    await setPrinterConfig(editPrinter);
    setShowPrinterModal(false);
  }

  async function handleTestPrint() {
    if (!printerConfig.type) {
      toast.warning('No Printer', 'Please configure a printer first.');
      return;
    }
    try {
      await printTestPage();
      setPrinterConnected(true);
      toast.success('Test print sent', 'Check the printer.');
    } catch (err) {
      toast.error('Print Failed', err instanceof Error ? err.message : 'Could not print');
    }
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
        `${printer.name} configured. Tap "Connect" to establish connection.`,
      );
    } catch (err) {
      toast.error('Error', err instanceof Error ? err.message : 'Could not save printer');
    }
  }

  async function handleConnectPrinter() {
    const { type } = usePrinterStore.getState().config;
    const ok = await confirm({
      title: 'Connect Printer',
      description:
        type === 'usb'
          ? 'Make sure your USB printer is plugged in. The system will request USB permission.'
          : type === 'bluetooth'
            ? 'Make sure the printer is powered on and paired with this device.'
            : 'Ensure the printer is reachable on the network.',
      confirmLabel: 'Connect',
    });
    if (!ok) return;
    try {
      await connectPrinter();
      setPrinterConnected(true);
      toast.success('Connected', 'Printer connected successfully.');
    } catch (err) {
      setPrinterConnected(false);
      toast.error(
        'Connection Failed',
        err instanceof Error ? err.message : 'Could not connect to printer.',
      );
    }
  }

  /* ── Till ──────────────────────────────────────────────────────── */
  const tillOpen = useTillStore((s) => s.isOpen);
  const tillOpenedAt = useTillStore((s) => s.openedAt);

  /* ── Sync ──────────────────────────────────────────────────────── */
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      await useDeviceSettings.getState().fetch();
      await useCatalogStore.getState().fetchAll().catch(() => {
        /* non-fatal — menu refresh is best-effort */
      });
      const cfg = useDeviceSettings.getState().config;
      const assignedTerminal = cfg?.terminal
        ? cfg.terminal.provider === 'anz'
          ? `ANZ Worldline (${cfg.terminal.terminalIp ?? '—'})`
          : cfg.terminal.provider === 'tyro'
            ? 'Tyro'
            : cfg.terminal.provider
        : 'not assigned';
      toast.success('Device synced', `Terminal: ${assignedTerminal}`);
    } catch (err) {
      toast.error(
        'Sync failed',
        err instanceof Error ? err.message : 'Could not reach the server',
      );
    } finally {
      setSyncing(false);
    }
  }

  /* ── Unpair ────────────────────────────────────────────────────── */
  async function handleUnpair() {
    const ok = await confirm({
      title: 'Unpair Device',
      description:
        'This will remove all device credentials. You will need to pair again.',
      confirmLabel: 'Unpair',
      destructive: true,
    });
    if (!ok) return;
    await clearIdentity();
    router.replace('/pair');
  }

  /* ── Render — PIN gate ─────────────────────────────────────────── */
  if (!unlocked) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.pinWrap}>
          <TouchableOpacity
            style={s.pinClose}
            onPress={() => router.replace('/(kiosk)/attract')}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={22} color="#888" />
          </TouchableOpacity>

          <Ionicons name="lock-closed" size={44} color="#6366f1" />
          <Text style={s.pinTitle}>Staff Settings</Text>
          <Text style={s.pinSubtitle}>Enter the 4-digit staff PIN to continue</Text>

          <View style={s.pinDotsRow}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  s.pinDot,
                  pinInput.length > i && s.pinDotFilled,
                  pinError && s.pinDotError,
                ]}
              />
            ))}
          </View>
          {pinError && <Text style={s.pinErrorText}>Incorrect PIN — try again</Text>}

          <View style={s.padGrid}>
            {[
              ['1', '2', '3'],
              ['4', '5', '6'],
              ['7', '8', '9'],
              ['clear', '0', 'back'],
            ].map((row, rowIdx) => (
              <View key={rowIdx} style={s.padRow}>
                {row.map((key) => (
                  <TouchableOpacity
                    key={key}
                    style={s.padBtn}
                    onPress={() => handlePinKey(key)}
                    activeOpacity={0.6}
                  >
                    {key === 'back' ? (
                      <Ionicons name="backspace-outline" size={22} color="#ccc" />
                    ) : key === 'clear' ? (
                      <Text style={s.padBtnSub}>clear</Text>
                    ) : (
                      <Text style={s.padBtnText}>{key}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  /* ── Render — unlocked ─────────────────────────────────────────── */
  return (
    <SafeAreaView style={s.container}>
      <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
        {/* ── Header ── */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerTitle}>Staff Settings</Text>
            <Text style={s.headerSub}>Kiosk · v{APP_VERSION}</Text>
          </View>
          <TouchableOpacity
            style={s.exitBtn}
            onPress={() => router.replace('/(kiosk)/attract')}
            activeOpacity={0.7}
          >
            <Ionicons name="exit-outline" size={18} color="#6366f1" />
            <Text style={s.exitBtnText}>Exit</Text>
          </TouchableOpacity>
        </View>

        {/* ═══════ Device Info ═══════ */}
        <Text style={s.sectionTitle}>Device Info</Text>

        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.label}>Role</Text>
            <View style={[s.roleBadge, identity?.role === 'kiosk' && s.roleKiosk]}>
              <Text style={s.roleBadgeText}>{identity?.role?.toUpperCase() ?? '—'}</Text>
            </View>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Merchant</Text>
            <Text style={s.value}>{serverConfig?.identity?.orgName ?? '—'}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Location</Text>
            <Text style={s.value}>{serverConfig?.identity?.locationName ?? '—'}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Device</Text>
            <Text style={s.value}>
              {serverConfig?.identity?.deviceLabel ?? identity?.label ?? '—'}
            </Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Location ID</Text>
            <Text style={s.value}>{truncate(identity?.locationId)}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Device ID</Text>
            <Text style={s.value}>{truncate(identity?.deviceId)}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Register ID</Text>
            <Text style={s.value}>{truncate(identity?.registerId)}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Payment Terminal</Text>
            <Text
              style={[s.value, { color: serverConfig?.terminal ? '#22c55e' : '#666' }]}
            >
              {serverConfig?.terminal
                ? serverConfig.terminal.provider === 'anz'
                  ? `ANZ Worldline (${serverConfig.terminal.terminalIp ?? '—'})`
                  : serverConfig.terminal.provider === 'tyro'
                    ? 'Tyro'
                    : serverConfig.terminal.provider
                : 'Not assigned'}
            </Text>
          </View>
          {!serverConfig?.terminal && serverConfig && (
            <>
              <View style={s.divider} />
              <View
                style={{
                  padding: 10,
                  backgroundColor: 'rgba(245, 158, 11, 0.08)',
                  borderRadius: 8,
                  margin: 12,
                }}
              >
                <Text style={{ color: '#f59e0b', fontSize: 12, fontWeight: '600' }}>
                  No terminal assigned to this device
                </Text>
                <Text
                  style={{ color: '#94a3b8', fontSize: 11, marginTop: 4, lineHeight: 15 }}
                >
                  Each kiosk needs its own payment terminal in the back-office.
                  Dashboard → Devices → select this device → Assign Terminal. Until
                  assigned, card payments are disabled on this kiosk.
                </Text>
              </View>
            </>
          )}
        </View>

        {/* ═══════ Till ═══════ */}
        <Text style={[s.sectionTitle, { marginTop: 32 }]}>Till</Text>
        <View style={s.card}>
          {tillOpen ? (
            <TouchableOpacity
              style={s.menuRow}
              onPress={() => router.push('/(pos)/close-till' as never)}
              activeOpacity={0.7}
            >
              <View style={s.menuRowLeft}>
                <Ionicons name="lock-closed-outline" size={20} color="#ef4444" />
                <Text style={s.menuRowText}>Close Till</Text>
              </View>
              <View style={s.menuRowRight}>
                <Text style={s.menuRowSub}>
                  {tillOpenedAt
                    ? `Opened at ${new Date(tillOpenedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Till is open'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color="#444" />
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={s.menuRow}
              onPress={() => router.push('/(pos)/open-till' as never)}
              activeOpacity={0.7}
            >
              <View style={s.menuRowLeft}>
                <Ionicons name="lock-open-outline" size={20} color="#22c55e" />
                <Text style={s.menuRowText}>Open Till</Text>
              </View>
              <View style={s.menuRowRight}>
                <Text style={s.menuRowSub}>Start shift · connect terminal</Text>
                <Ionicons name="chevron-forward" size={18} color="#444" />
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* ═══════ Printer ═══════ */}
        <Text style={[s.sectionTitle, { marginTop: 32 }]}>Printer</Text>
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.label}>Receipt Printer</Text>
            <Text style={s.value}>
              {printerConfig.name ||
                (printerConfig.type ? printerConfig.address : 'Not configured')}
            </Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Connection</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: printerConnected ? '#22c55e' : '#666',
                }}
              />
              <Text style={s.value}>
                {printerConfig.type?.toUpperCase() ?? '—'}{' '}
                {printerConnected ? '(Connected)' : ''}
              </Text>
            </View>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Auto-Print Receipts</Text>
            <Switch
              value={printerConfig.autoPrint}
              onValueChange={(v) => setPrinterConfig({ autoPrint: v })}
              trackColor={{ false: '#2a2a3a', true: '#6366f180' }}
              thumbColor={printerConfig.autoPrint ? '#6366f1' : '#555'}
            />
          </View>
        </View>

        {/* Scan + Connect/Test buttons */}
        <View style={s.btnRow}>
          <TouchableOpacity
            style={s.outlineBtn}
            onPress={() => handleDiscoverPrinters('usb')}
            activeOpacity={0.85}
          >
            {discovering ? (
              <ActivityIndicator size="small" color="#ccc" />
            ) : (
              <Ionicons name="search-outline" size={16} color="#ccc" />
            )}
            <Text style={s.outlineBtnText}>Scan USB</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              s.outlineBtn,
              printerConnected && { borderColor: '#22c55e' },
              !printerConfig.type && { opacity: 0.4 },
            ]}
            onPress={printerConnected ? handleTestPrint : handleConnectPrinter}
            disabled={!printerConfig.type}
            activeOpacity={0.85}
          >
            <Ionicons
              name={printerConnected ? 'print-outline' : 'link-outline'}
              size={16}
              color={printerConnected ? '#22c55e' : '#ccc'}
            />
            <Text
              style={[s.outlineBtnText, printerConnected && { color: '#22c55e' }]}
            >
              {printerConnected ? 'Test Print' : 'Connect'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Discovered printers list */}
        {discoveredPrinters.length > 0 && (
          <View style={[s.card, { marginTop: 8 }]}>
            <Text
              style={[
                s.label,
                { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
              ]}
            >
              Found Printers
            </Text>
            {discoveredPrinters.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[s.manageRow, { paddingHorizontal: 16 }]}
                onPress={() => handleSelectPrinter(p)}
                activeOpacity={0.6}
              >
                <Ionicons
                  name="print"
                  size={18}
                  color="#6366f1"
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.manageName}>{p.name}</Text>
                  <Text style={s.manageSub}>
                    {p.type.toUpperCase()} · {p.id}
                  </Text>
                </View>
                <Ionicons name="add-circle-outline" size={22} color="#22c55e" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={[s.btnRow, { marginTop: 8 }]}>
          <TouchableOpacity
            style={s.outlineBtn}
            onPress={openPrinterModal}
            activeOpacity={0.85}
          >
            <Ionicons name="settings-outline" size={16} color="#ccc" />
            <Text style={s.outlineBtnText}>Advanced</Text>
          </TouchableOpacity>
        </View>

        {/* ═══════ Sync ═══════ */}
        <Text style={[s.sectionTitle, { marginTop: 32 }]}>Sync</Text>
        <TouchableOpacity
          style={[s.syncBtn, syncing && s.syncBtnDisabled]}
          onPress={handleSync}
          disabled={syncing}
          activeOpacity={0.85}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="#6366f1" />
          ) : (
            <>
              <Ionicons name="sync" size={18} color="#6366f1" />
              <Text style={s.syncBtnText}>Sync Device Settings</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={[s.warning, { marginBottom: 12 }]}>
          Re-pulls terminal assignment, printers, and menu from the dashboard.
        </Text>

        {/* ═══════ Unpair ═══════ */}
        <Text style={[s.sectionTitle, { marginTop: 32 }]}>Danger Zone</Text>
        <TouchableOpacity
          style={s.unpairBtn}
          onPress={handleUnpair}
          activeOpacity={0.85}
        >
          <Text style={s.unpairBtnText}>Unpair Device</Text>
        </TouchableOpacity>
        <Text style={s.warning}>
          Unpairing will require a new pairing code from the back-office.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ═══════════ Printer Config Modal (Advanced) ═══════════ */}
      <Modal
        visible={showPrinterModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPrinterModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Configure Printer</Text>

            <Text style={s.inputLabel}>Printer Name</Text>
            <TextInput
              style={s.input}
              value={editPrinter.name}
              onChangeText={(t) => setEditPrinter((p) => ({ ...p, name: t }))}
              placeholder="e.g. Kiosk Printer"
              placeholderTextColor="#444"
            />

            <Text style={s.inputLabel}>Connection Type</Text>
            <View style={s.typeRow}>
              {(['network', 'usb', 'bluetooth'] as PrinterConnectionType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[s.typeBtn, editPrinter.type === t && s.typeBtnActive]}
                  onPress={() => setEditPrinter((p) => ({ ...p, type: t }))}
                >
                  <Ionicons
                    name={
                      t === 'network'
                        ? 'wifi'
                        : t === 'usb'
                          ? 'hardware-chip-outline'
                          : 'bluetooth'
                    }
                    size={16}
                    color={editPrinter.type === t ? '#fff' : '#888'}
                  />
                  <Text
                    style={[
                      s.typeBtnText,
                      editPrinter.type === t && s.typeBtnTextActive,
                    ]}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.inputLabel}>
              {editPrinter.type === 'network' ? 'IP Address : Port' : 'Device Address'}
            </Text>
            <TextInput
              style={s.input}
              value={editPrinter.address}
              onChangeText={(t) => setEditPrinter((p) => ({ ...p, address: t }))}
              placeholder={
                editPrinter.type === 'network' ? '192.168.1.100:9100' : 'Device path'
              }
              placeholderTextColor="#444"
              autoCapitalize="none"
            />

            <Text style={s.inputLabel}>Paper Width</Text>
            <View style={s.typeRow}>
              {([58, 80] as const).map((w) => (
                <TouchableOpacity
                  key={w}
                  style={[s.typeBtn, editPrinter.paperWidth === w && s.typeBtnActive]}
                  onPress={() => setEditPrinter((p) => ({ ...p, paperWidth: w }))}
                >
                  <Text
                    style={[
                      s.typeBtnText,
                      editPrinter.paperWidth === w && s.typeBtnTextActive,
                    ]}
                  >
                    {w}mm
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.switchRow}>
              <Text style={s.switchLabel}>Auto-print receipts</Text>
              <Switch
                value={editPrinter.autoPrint}
                onValueChange={(v) => setEditPrinter((p) => ({ ...p, autoPrint: v }))}
                trackColor={{ false: '#2a2a3a', true: '#6366f180' }}
                thumbColor={editPrinter.autoPrint ? '#6366f1' : '#555'}
              />
            </View>

            <TouchableOpacity
              style={s.saveBtn}
              onPress={savePrinterConfig}
              activeOpacity={0.85}
            >
              <Text style={s.saveBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={() => setShowPrinterModal(false)}
              activeOpacity={0.85}
            >
              <Text style={s.cancelBtnText}>Cancel</Text>
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
  container: { flex: 1, backgroundColor: '#0d0d14' },
  content: { flex: 1, padding: 24 },

  /* ── Header ── */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: 13, color: '#666', marginTop: 2 },
  exitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(99,102,241,0.1)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.35)',
  },
  exitBtnText: { fontSize: 14, fontWeight: '700', color: '#6366f1' },

  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 16 },

  /* ── Card / rows ── */
  card: {
    backgroundColor: '#141425',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  divider: { height: 1, backgroundColor: '#1e1e2e', marginHorizontal: 16 },
  label: { fontSize: 14, color: '#777' },
  value: { fontSize: 14, color: '#ccc', fontWeight: '500' },

  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuRowText: { fontSize: 15, fontWeight: '600', color: '#ccc' },
  menuRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuRowSub: { fontSize: 12, color: '#555', fontWeight: '500' },

  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  manageName: { fontSize: 14, fontWeight: '600', color: '#ccc', flex: 1 },
  manageSub: { fontSize: 12, color: '#666', marginTop: 2 },

  /* ── Role badge ── */
  roleBadge: {
    backgroundColor: '#2a2a3a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleKiosk: {
    backgroundColor: 'rgba(249,115,22,0.2)',
    borderWidth: 1,
    borderColor: '#f97316',
  },
  roleBadgeText: { fontSize: 13, fontWeight: '800', color: '#f97316' },

  /* ── Buttons ── */
  btnRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  outlineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1e1e2e',
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  outlineBtnText: { fontSize: 15, fontWeight: '600', color: '#ccc' },

  /* ── Sync ── */
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(99,102,241,0.1)',
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: '#6366f1',
    marginBottom: 6,
  },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { fontSize: 16, fontWeight: '700', color: '#6366f1' },

  /* ── Unpair ── */
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

  /* ── PIN gate ── */
  pinWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  pinClose: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141425',
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  pinTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginTop: 18,
  },
  pinSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 6,
    marginBottom: 28,
    textAlign: 'center',
  },
  pinDotsRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 10,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#2a2a3a',
    backgroundColor: 'transparent',
  },
  pinDotFilled: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  pinDotError: {
    borderColor: '#ef4444',
  },
  pinErrorText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  padGrid: {
    marginTop: 26,
    gap: 12,
  },
  padRow: {
    flexDirection: 'row',
    gap: 12,
  },
  padBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#141425',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  padBtnText: { fontSize: 26, fontWeight: '700', color: '#ccc' },
  padBtnSub: { fontSize: 12, fontWeight: '600', color: '#666' },

  /* ── Printer modal ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#141425',
    borderRadius: 20,
    padding: 24,
    width: 400,
    maxWidth: '92%',
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#777',
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#1e1e2e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#ccc',
  },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1e1e2e',
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  typeBtnActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  typeBtnText: { fontSize: 13, fontWeight: '600', color: '#888' },
  typeBtnTextActive: { color: '#fff' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingVertical: 4,
  },
  switchLabel: { fontSize: 14, color: '#ccc' },
  saveBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#666' },
});
