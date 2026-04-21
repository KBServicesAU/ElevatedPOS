import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { toast } from '../../components/ui';
import { useAnzStore } from '../../store/anz';
import { useTillStore } from '../../store/till';
import { useAnzBridge } from '../../components/AnzBridgeHost';
import { useAuthStore } from '../../store/auth';
import { getServerAnzConfig } from '../../store/device-settings';

/**
 * Open Till screen.
 *
 * Operator enters the starting float (cash in drawer at shift start)
 * and the app:
 *   1. Records it in the persistent till session.
 *   2. Opens the persistent ANZ bridge (Connect → Login → Activate).
 * On success the terminal stays connected for subsequent transactions.
 */

export default function OpenTillScreen() {
  const router = useRouter();
  const bridge = useAnzBridge();
  const { isOpen, openTill: openTillStore, reset: resetTill } = useTillStore();
  const employee = useAuthStore((s) => s.employee);
  const anzConfig = useAnzStore((s) => s.config);

  const [floatInput, setFloatInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  // Derive the live terminal address (prefer server-pushed config).
  const serverCfg = getServerAnzConfig();
  const effectiveIp   = serverCfg?.terminalIp ?? anzConfig.terminalIp;
  const effectivePort = serverCfg?.terminalPort ?? anzConfig.terminalPort ?? 7784;

  // Subscribe to bridge status messages so the operator sees progress.
  useEffect(() => {
    return bridge.onStatus((m) => setStatusText(m));
  }, [bridge]);

  async function handleOpen() {
    const floatDollars = parseFloat(floatInput);
    if (!isFinite(floatDollars) || floatDollars < 0) {
      toast.warning('Invalid float', 'Enter a non-negative dollar amount.');
      return;
    }
    if (!effectiveIp.trim()) {
      toast.error('No terminal', 'Configure the terminal IP in ANZ Settings first.');
      return;
    }

    const floatCents = Math.round(floatDollars * 100);
    setSubmitting(true);
    setStatusText('Starting…');
    try {
      await openTillStore(floatCents, employee?.id);
      await bridge.openTill();
      toast.success('Till opened', `Starting float $${floatDollars.toFixed(2)}.`);
      router.back();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Roll back the till session so we don't leave the app in an
      // "open but not connected" state.
      await resetTill();
      toast.error('Could not open till', msg);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * When the till was already open (previous session crashed / app was
   * killed mid-shift), reopen the bridge with the saved float instead
   * of forcing the operator to close + re-open. Fast path: just run
   * bridge.openTill() which is idempotent.
   */
  async function handleResume() {
    setSubmitting(true);
    setStatusText('Reconnecting terminal…');
    try {
      await bridge.openTill();
      toast.success('Shift resumed', 'Terminal is reconnected.');
      router.back();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Could not reconnect', msg);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Escape hatch when the bridge is stuck (e.g. looping "Activating…").
   * Force-resets the WebView side (disposes the terminal handle locally,
   * sends nothing to the physical device) and clears the till store so
   * the operator can enter a fresh float.
   */
  async function handleForceReset() {
    setSubmitting(true);
    setStatusText('Resetting…');
    try {
      await bridge.forceReset();
      await resetTill();
      toast.success('Till reset', 'You can now open a fresh shift.');
      setStatusText(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Reset failed', msg);
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || bridge.state === 'opening';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Open Till',
          headerStyle: { backgroundColor: '#141425' },
          headerTintColor: '#fff',
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {isOpen && (
          <View style={styles.warnBox}>
            <Ionicons name="information-circle-outline" size={16} color="#60a5fa" />
            <Text style={styles.warnText}>
              A till is already open from a previous session. Resume the shift
              to reconnect the terminal, or reset to start a new shift.
            </Text>
          </View>
        )}

        {/* Terminal info */}
        <Text style={styles.sectionTitle}>Terminal</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Terminal</Text>
            <Text style={styles.value}>
              {effectiveIp ? `${effectiveIp}:${effectivePort}` : 'Not configured'}
            </Text>
          </View>
        </View>

        {/* Float input */}
        <Text style={styles.sectionTitle}>Starting Float</Text>
        <View style={styles.card}>
          <Text style={styles.inputLabel}>Amount ($)</Text>
          <TextInput
            style={styles.bigInput}
            value={floatInput}
            onChangeText={setFloatInput}
            placeholder="0.00"
            placeholderTextColor="#444"
            keyboardType="decimal-pad"
            editable={!busy}
          />
          <Text style={styles.hint}>
            Cash in the drawer at the start of the shift. This is used later to
            work out variance at close.
          </Text>
        </View>

        {/* Status */}
        {statusText && (
          <View style={styles.statusBox}>
            <ActivityIndicator size="small" color="#6366f1" />
            <Text style={styles.statusText}>{statusText}</Text>
          </View>
        )}

        {isOpen ? (
          <>
            <TouchableOpacity
              style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
              onPress={handleResume}
              disabled={busy}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="refresh-outline" size={16} color="#fff" />
              )}
              <Text style={styles.primaryBtnText}>
                {busy ? 'Reconnecting…' : 'Resume Shift (reconnect terminal)'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dangerBtn, busy && { opacity: 0.6 }]}
              onPress={handleForceReset}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Ionicons name="power-outline" size={16} color="#f87171" />
              <Text style={styles.dangerBtnText}>
                Force Reset — Start New Shift
              </Text>
            </TouchableOpacity>
            <Text style={[styles.hint, { textAlign: 'center', marginTop: 8 }]}>
              Use Force Reset if the terminal is stuck on &quot;Activating…&quot;
              or &quot;Connecting…&quot;.
            </Text>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
              onPress={handleOpen}
              disabled={busy}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="lock-open-outline" size={16} color="#fff" />
              )}
              <Text style={styles.primaryBtnText}>
                {busy ? 'Opening…' : 'Open Till'}
              </Text>
            </TouchableOpacity>

            {/* v2.7.32 — escape hatch when the initial Open Till hangs
                (terminal unreachable / stale session on device side).
                Without this, the user is stuck with a disabled
                "Opening…" button forever. */}
            {busy && (
              <>
                <TouchableOpacity
                  style={styles.dangerBtn}
                  onPress={handleForceReset}
                  activeOpacity={0.85}
                >
                  <Ionicons name="power-outline" size={16} color="#f87171" />
                  <Text style={styles.dangerBtnText}>Cancel & Reset Terminal</Text>
                </TouchableOpacity>
                <Text style={[styles.hint, { textAlign: 'center', marginTop: 8 }]}>
                  Stuck on &quot;Logging in&quot; or &quot;Activating&quot;? Tap Reset
                  to clear the bridge and try again. Your float amount is kept.
                </Text>
              </>
            )}
          </>
        )}

        <Text style={styles.footHint}>
          Runs Connect → Login → Activate on the terminal and keeps it connected
          for the rest of the shift.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

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
  inputLabel: { color: '#888', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  bigInput: {
    backgroundColor: '#0f0f1a',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  hint: { color: '#555', fontSize: 11, marginTop: 10, lineHeight: 15 },
  footHint: { color: '#555', fontSize: 11, marginTop: 12, textAlign: 'center' },
  statusBox: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(99,102,241,0.1)',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  statusText: { color: '#c4b5fd', fontSize: 13, fontWeight: '600', flex: 1 },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  warnText: { color: '#f59e0b', fontSize: 12, fontWeight: '600', flex: 1 },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: '#22c55e',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  dangerBtn: {
    marginTop: 12,
    borderColor: '#f87171',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
  },
  dangerBtnText: { color: '#f87171', fontWeight: '700', fontSize: 14 },
});
