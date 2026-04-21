import React, { useEffect, useMemo, useState } from 'react';
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
import { useTillStore } from '../../store/till';
import { useAnzBridge } from '../../components/AnzBridgeHost';

/**
 * Close Till screen.
 *
 * Shows the expected cash (float + cash sales), lets the operator
 * enter the counted cash, and computes variance. On Close Till we:
 *   1. Disconnect the terminal (Deactivate → Logout → Dispose).
 *   2. Record the reconciliation in the persistent till session.
 */

function formatDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function parseDollars(input: string): number | null {
  const v = parseFloat(input);
  if (!isFinite(v) || v < 0) return null;
  return Math.round(v * 100);
}

export default function CloseTillScreen() {
  const router = useRouter();
  const bridge = useAnzBridge();
  const till = useTillStore();

  const [countedInput, setCountedInput] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  useEffect(() => {
    return bridge.onStatus((m) => setStatusText(m));
  }, [bridge]);

  const expectedCents = till.floatCents + till.cashCents;
  const countedCents  = useMemo(() => parseDollars(countedInput), [countedInput]);
  const varianceCents = countedCents != null ? countedCents - expectedCents : null;

  async function handleClose() {
    if (countedCents == null) {
      toast.warning('Invalid', 'Enter the counted cash amount.');
      return;
    }
    if (!till.isOpen) {
      toast.warning('No open till', 'There is no open till to close.');
      return;
    }

    setSubmitting(true);
    setStatusText('Starting…');
    try {
      // Tear down the terminal first. If the bridge was already disconnected
      // we still want to record the reconciliation, so we only treat a
      // non-"Till is not open" failure as fatal.
      try {
        await bridge.closeTill();
      } catch (err) {
        const em = err instanceof Error ? err.message : String(err);
        if (!/not open/i.test(em)) {
          throw err;
        }
      }
      await till.closeTill(countedCents, notes);
      const vDollars = ((countedCents - expectedCents) / 100).toFixed(2);
      toast.success('Till closed', `Variance $${vDollars}.`);
      router.back();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Could not close till', msg);
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || bridge.state === 'closing';
  const varianceColor =
    varianceCents == null ? '#888' : varianceCents === 0 ? '#22c55e' : varianceCents > 0 ? '#22c55e' : '#ef4444';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Close Till',
          headerStyle: { backgroundColor: '#141425' },
          headerTintColor: '#fff',
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {!till.isOpen && (
          <View style={styles.warnBox}>
            <Ionicons name="warning-outline" size={16} color="#f59e0b" />
            <Text style={styles.warnText}>No till is currently open.</Text>
          </View>
        )}

        {/* Reconciliation */}
        <Text style={styles.sectionTitle}>Reconciliation</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Float</Text>
            <Text style={styles.value}>${formatDollars(till.floatCents)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Cash Sales</Text>
            <Text style={styles.value}>${formatDollars(till.cashCents)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={[styles.label, { color: '#fff', fontWeight: '800' }]}>Expected</Text>
            <Text style={[styles.value, { color: '#fff', fontWeight: '800' }]}>
              ${formatDollars(expectedCents)}
            </Text>
          </View>
        </View>

        {/* Counted cash */}
        <Text style={styles.sectionTitle}>Counted Cash</Text>
        <View style={styles.card}>
          <Text style={styles.inputLabel}>Amount ($)</Text>
          <TextInput
            style={styles.bigInput}
            value={countedInput}
            onChangeText={setCountedInput}
            placeholder="0.00"
            placeholderTextColor="#444"
            keyboardType="decimal-pad"
            editable={!busy}
          />
          <View style={[styles.row, { marginTop: 14 }]}>
            <Text style={styles.label}>Variance</Text>
            <Text style={[styles.value, { color: varianceColor, fontWeight: '800' }]}>
              {varianceCents == null
                ? '—'
                : `${varianceCents >= 0 ? '+' : '−'}$${formatDollars(Math.abs(varianceCents))}`}
            </Text>
          </View>
        </View>

        {/* Notes */}
        <Text style={styles.sectionTitle}>Notes (optional)</Text>
        <View style={styles.card}>
          <TextInput
            style={styles.notes}
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. $5 short — missing receipt from Dave"
            placeholderTextColor="#444"
            multiline
            numberOfLines={3}
            editable={!busy}
          />
        </View>

        {/* Status */}
        {statusText && (
          <View style={styles.statusBox}>
            <ActivityIndicator size="small" color="#6366f1" />
            <Text style={styles.statusText}>{statusText}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryBtn, (busy || !till.isOpen) && { opacity: 0.6 }]}
          onPress={handleClose}
          disabled={busy || !till.isOpen}
          activeOpacity={0.85}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="lock-closed-outline" size={16} color="#fff" />
          )}
          <Text style={styles.primaryBtnText}>
            {busy ? 'Closing…' : 'Close Till'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.footHint}>
          Runs Deactivate → Logout on the terminal and records the final cash
          count in the till session.
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
  divider: { height: 1, backgroundColor: '#1e1e2e', marginVertical: 8 },
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
  notes: {
    backgroundColor: '#0f0f1a',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: 'top',
  },
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
  footHint: { color: '#555', fontSize: 11, marginTop: 12, textAlign: 'center' },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: '#ef4444',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
