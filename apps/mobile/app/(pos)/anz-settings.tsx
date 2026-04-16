import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { AnzPairingModal } from '../../components/AnzPairingModal';
import { toast } from '../../components/ui';
import {
  useTerminalConnectionStore,
  type TerminalCredential,
} from '../../store/terminal-connection';

const DEFAULT_ANZ_PORT = 7784;

/**
 * ANZ Terminal selection screen (multi-terminal).
 *
 * Terminals themselves (IP, port, label) are registered by an admin in
 * Dashboard → Payments → Terminals. Here the operator just picks which of
 * those registered ANZ terminals this register should use, saves the
 * selection, then runs the Connect → Login → Activate pair lifecycle against
 * it. Selection is persisted to the server (device_payment_configs) so the
 * same device always lights up the same terminal.
 */
export default function ANZSettingsScreen() {
  const {
    credentials,
    selectedId,
    loaded,
    fetchCredentials,
    hydrateSelection,
    persistSelection,
  } = useTerminalConnectionStore();

  const [pickerOpen, setPickerOpen]   = useState(false);
  const [pendingId, setPendingId]     = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [showPairing, setShowPairing] = useState(false);

  // Hydrate saved selection from AsyncStorage, then fetch the fresh list from
  // the server. Either can come first — setSelectedId doesn't touch the net.
  useEffect(() => {
    void hydrateSelection();
    void fetchCredentials();
  }, [hydrateSelection, fetchCredentials]);

  // Only ANZ credentials are relevant on this screen — the other providers
  // (Tyro, Stripe, ElevatedPOS Pay) have their own configuration surfaces.
  const anzTerminals = useMemo(
    () => credentials.filter((c) => c.provider === 'anz' && c.isActive && c.terminalIp),
    [credentials],
  );

  // `pendingId` is the operator's staged pick before they hit Save. Default
  // it to whatever's currently persisted so the Save button starts disabled.
  useEffect(() => {
    if (pendingId === null && selectedId) setPendingId(selectedId);
  }, [selectedId, pendingId]);

  const selectedRow  = anzTerminals.find((t) => t.id === selectedId) ?? null;
  const stagedRow    = anzTerminals.find((t) => t.id === pendingId)  ?? null;
  const dirty        = pendingId !== selectedId;
  const canSave      = !saving && !!pendingId && dirty;

  async function handleSave() {
    if (!pendingId) return;
    setSaving(true);
    try {
      await persistSelection(pendingId);
      toast.success('Saved', 'Terminal selection saved for this register.');
    } catch (err) {
      toast.error('Save failed', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    if (!stagedRow) {
      toast.warning('Pick a terminal first', 'Select a terminal before testing the connection.');
      return;
    }
    // Save first if dirty, so the pair modal + subsequent transactions see the
    // selection. Non-fatal if it fails — still open the pair modal.
    if (dirty) {
      try { await persistSelection(pendingId); } catch { /* ignore — still test */ }
    }
    setShowPairing(true);
  }

  const activeTerminal: TerminalCredential | null = stagedRow ?? selectedRow;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'ANZ Worldline',
          headerStyle: { backgroundColor: '#141425' },
          headerTintColor: '#fff',
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {/* ─── Status ─────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Provider</Text>
            <Text style={styles.value}>ANZ Worldline TIM</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.statusRight}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: selectedRow ? '#22c55e' : '#666' },
                ]}
              />
              <Text style={[styles.value, { color: selectedRow ? '#22c55e' : '#888' }]}>
                {selectedRow ? 'Selected' : 'Not selected'}
              </Text>
            </View>
          </View>
          {selectedRow && (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.label}>Terminal</Text>
                <Text style={styles.value}>
                  {selectedRow.label ?? 'Unlabeled'}
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.label}>IP : Port</Text>
                <Text style={styles.value}>
                  {selectedRow.terminalIp}:{selectedRow.terminalPort ?? DEFAULT_ANZ_PORT}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* ─── Terminal Picker ─────────────────────── */}
        <Text style={styles.sectionTitle}>Terminal For This Register</Text>
        <View style={styles.card}>
          {!loaded ? (
            <View style={styles.emptyBlock}>
              <ActivityIndicator color="#6366f1" />
              <Text style={styles.emptyHint}>Loading terminals…</Text>
            </View>
          ) : anzTerminals.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Ionicons name="information-circle-outline" size={22} color="#6366f1" />
              <Text style={[styles.emptyHint, { marginTop: 6 }]}>
                No ANZ terminals registered for this organisation yet.
              </Text>
              <Text style={[styles.emptyHint, { marginTop: 4 }]}>
                An admin must add one in Dashboard → Payments → Terminals first.
              </Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={styles.picker}
                onPress={() => setPickerOpen(true)}
                activeOpacity={0.85}
                disabled={saving}
              >
                <View style={{ flex: 1 }}>
                  {stagedRow ? (
                    <>
                      <Text style={styles.pickerTitle}>
                        {stagedRow.label ?? 'Terminal'}
                      </Text>
                      <Text style={styles.pickerSubtitle}>
                        {stagedRow.terminalIp}:{stagedRow.terminalPort ?? DEFAULT_ANZ_PORT}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.pickerTitle}>— Select a terminal —</Text>
                  )}
                </View>
                <Ionicons name="chevron-down" size={18} color="#888" />
              </TouchableOpacity>

              <Text style={styles.hint}>
                {anzTerminals.length} ANZ terminal{anzTerminals.length === 1 ? '' : 's'} configured
                for this organisation. Add more in Dashboard → Payments → Terminals.
              </Text>

              <TouchableOpacity
                style={[styles.primaryBtn, !canSave && styles.primaryBtnDisabled]}
                onPress={handleSave}
                disabled={!canSave}
                activeOpacity={0.85}
              >
                <Ionicons name="save-outline" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>
                  {saving
                    ? 'Saving…'
                    : dirty
                      ? 'Save Selection'
                      : 'Saved'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.testBtn, !activeTerminal && { opacity: 0.4 }]}
                onPress={handleTestConnection}
                disabled={!activeTerminal}
                activeOpacity={0.85}
              >
                <Ionicons name="wifi-outline" size={15} color="#6366f1" />
                <Text style={styles.testBtnText}>Pair & Test Connection</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ─── How this works ─────────────────────── */}
        <Text style={styles.sectionTitle}>How Selection Works</Text>
        <View style={styles.card}>
          <Text style={styles.hint}>
            ·{' '}
            <Text style={{ color: '#bbb', fontWeight: '700' }}>Dashboard</Text>
            {' '}is where an admin registers each physical ANZ terminal (label, IP, port).
          </Text>
          <Text style={[styles.hint, { marginTop: 8 }]}>
            ·{' '}
            <Text style={{ color: '#bbb', fontWeight: '700' }}>POS</Text>
            {' '}(this screen) is where each register picks which of those terminals it
            pairs with. Selection persists until changed.
          </Text>
          <Text style={[styles.hint, { marginTop: 8 }]}>
            ·{' '}
            <Text style={{ color: '#bbb', fontWeight: '700' }}>Pair & Test</Text>
            {' '}runs the SIXml Connect → Login → Activate lifecycle so you can verify
            the register can reach the terminal on the network before taking a real
            payment.
          </Text>
        </View>
      </ScrollView>

      {/* ─── Terminal picker modal ───────────────── */}
      <Modal
        animationType="slide"
        transparent
        visible={pickerOpen}
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select ANZ Terminal</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Ionicons name="close" size={22} color="#888" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {anzTerminals.map((t) => {
                const isPicked = t.id === pendingId;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.modalRow, isPicked && styles.modalRowActive]}
                    onPress={() => {
                      setPendingId(t.id);
                      setPickerOpen(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={isPicked ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={isPicked ? '#6366f1' : '#555'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalRowTitle}>
                        {t.label ?? 'Unlabeled terminal'}
                      </Text>
                      <Text style={styles.modalRowSubtitle}>
                        {t.terminalIp}:{t.terminalPort ?? DEFAULT_ANZ_PORT}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/*
        Pair flow modal — runs a real Connect → Login → Activate lifecycle
        through the timapi.js SDK (in a hidden WebView) against the staged
        terminal. We pass the staged row rather than the saved row so the
        operator can pair against the fresh pick even before Save.
      */}
      {activeTerminal && (
        <AnzPairingModal
          visible={showPairing}
          config={{
            terminalIp:   activeTerminal.terminalIp?.trim() ?? '',
            terminalPort: activeTerminal.terminalPort ?? DEFAULT_ANZ_PORT,
            integratorId: activeTerminal.integratorId, // bridge falls back to SDK default if undefined
          }}
          onPaired={() => {
            setShowPairing(false);
            toast.success('Connected', 'Terminal paired successfully.');
          }}
          onError={(msg) => {
            setShowPairing(false);
            toast.error('Connection Failed', msg);
          }}
          onDismiss={() => setShowPairing(false)}
        />
      )}
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  sectionTitle: {
    color: '#888',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#141425',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e1e2e',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  label: { color: '#888', fontSize: 13, fontWeight: '600' },
  value: { color: '#fff', fontSize: 13, fontWeight: '600' },
  hint: { color: '#666', fontSize: 11, lineHeight: 16 },
  divider: { height: 1, backgroundColor: '#1e1e2e', marginVertical: 8 },
  statusRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  emptyBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  emptyHint: { color: '#888', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f0f1a',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  pickerSubtitle: { color: '#888', fontSize: 11, marginTop: 2, fontFamily: 'monospace' },
  testBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#6366f1',
    borderRadius: 10,
    paddingVertical: 10,
  },
  testBtnText: { color: '#6366f1', fontWeight: '700', fontSize: 13 },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#141425',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#0f0f1a',
    borderWidth: 1,
    borderColor: '#1e1e2e',
  },
  modalRowActive: {
    backgroundColor: 'rgba(99,102,241,0.1)',
    borderColor: '#6366f1',
  },
  modalRowTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  modalRowSubtitle: { color: '#888', fontSize: 11, marginTop: 2, fontFamily: 'monospace' },
});
