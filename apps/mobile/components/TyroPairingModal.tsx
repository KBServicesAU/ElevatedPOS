import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addTyroListener,
  pairTyro,
  type TyroPairingStatusEvent,
} from '../modules/tyro-tta';
import { toast } from './ui';

/**
 * Custom pairing UI for Tyro iClient.
 *
 * Certification requirements (Client.Retail.HeadlessPairing.2-8):
 *   - POS must collect MID and TID from the merchant and call pairTerminal()
 *     with the custom pairing flag enabled (our bridge handles that).
 *   - POS must show its own UI (this modal) — not the Tyro default pairing page.
 *   - POS must display the pairing status as it progresses (inProgress → success/failure).
 *   - If the pair call times out (~90s), POS must surface the timeout and let the
 *     merchant retry.
 *   - Once pairing succeeds, the integration key is stored securely by the SDK
 *     automatically; POS just needs to confirm the success to the merchant.
 */

type PairPhase = 'idle' | 'pairing' | 'success' | 'failure' | 'timeout';

export interface TyroPairingModalProps {
  visible: boolean;
  /** Called once pairing is definitively done (success / failure / timeout). */
  onComplete?: (status: 'success' | 'failure' | 'timeout') => void;
  /** Called when the merchant dismisses the modal. */
  onClose: () => void;
}

const PAIR_TIMEOUT_MS = 90_000; // Tyro cert: 90 seconds

export function TyroPairingModal({ visible, onComplete, onClose }: TyroPairingModalProps) {
  const [mid, setMid] = useState('');
  const [tid, setTid] = useState('');
  const [phase, setPhase] = useState<PairPhase>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [integrationKey, setIntegrationKey] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Reset on open ───────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    setPhase('idle');
    setStatusMessage('');
    setIntegrationKey(null);
    setRemainingSeconds(0);
    clearTimers();
    return () => clearTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ── Listen for pairing status events ────────────────────────────
  useEffect(() => {
    if (!visible) return;

    const sub = addTyroListener('onPairingStatus', (e: TyroPairingStatusEvent) => {
      const status = String(e.status || '').toLowerCase();

      if (status === 'inprogress' || status === 'in_progress' || status === 'in-progress') {
        setPhase('pairing');
        if (e.message) setStatusMessage(e.message);
        return;
      }

      if (status === 'success') {
        clearTimers();
        setPhase('success');
        setStatusMessage(e.message || 'Pairing successful');
        if (e.integrationKey) setIntegrationKey(e.integrationKey);
        onComplete?.('success');
        return;
      }

      if (status === 'failure' || status === 'failed' || status === 'error') {
        clearTimers();
        setPhase('failure');
        setStatusMessage(e.message || 'Pairing failed. Please try again.');
        onComplete?.('failure');
        return;
      }
    });

    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function clearTimers() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }

  function startPairing() {
    const cleanMid = mid.trim();
    const cleanTid = tid.trim();
    if (!cleanMid || !cleanTid) {
      toast.warning('Missing details', 'Please enter both the MID and TID supplied by Tyro.');
      return;
    }

    setPhase('pairing');
    setStatusMessage('Pairing with terminal...');
    setIntegrationKey(null);

    // Kick off pairing. Callbacks come via addTyroListener('onPairingStatus').
    try {
      pairTyro(cleanMid, cleanTid);
    } catch (err) {
      setPhase('failure');
      setStatusMessage(err instanceof Error ? err.message : 'Failed to start pairing');
      return;
    }

    // 90-second hard timeout
    setRemainingSeconds(Math.round(PAIR_TIMEOUT_MS / 1000));
    tickerRef.current = setInterval(() => {
      setRemainingSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    timeoutRef.current = setTimeout(() => {
      if (tickerRef.current) {
        clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
      // Only flip to timeout if we're still in the pairing phase.
      setPhase((p) => {
        if (p === 'pairing') {
          setStatusMessage(
            'Pairing timed out after 90 seconds. Check the terminal is turned on and connected to the same network, then try again.',
          );
          onComplete?.('timeout');
          return 'timeout';
        }
        return p;
      });
    }, PAIR_TIMEOUT_MS);
  }

  function handleClose() {
    clearTimers();
    // Block closing while pairing is actively in flight.
    if (phase === 'pairing') {
      toast.warning(
        'Pairing in progress',
        'A pairing attempt is currently running. Please wait for it to finish or cancel the terminal first.',
      );
      return;
    }
    onClose();
  }

  const canEditFields = phase === 'idle' || phase === 'failure' || phase === 'timeout';
  const canPair = canEditFields && mid.trim().length > 0 && tid.trim().length > 0;

  const phaseIcon = (() => {
    switch (phase) {
      case 'success':
        return <Ionicons name="checkmark-circle" size={64} color="#22c55e" />;
      case 'failure':
      case 'timeout':
        return <Ionicons name="alert-circle" size={64} color="#ef4444" />;
      case 'pairing':
        return <ActivityIndicator size="large" color="#6366f1" />;
      default:
        return <Ionicons name="wifi" size={64} color="#6366f1" />;
    }
  })();

  const maskedKey = integrationKey
    ? integrationKey.length > 8
      ? `${integrationKey.slice(0, 4)}…${integrationKey.slice(-4)}`
      : '••••'
    : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.card}>
          {/* ── Header ───────────────────────────────────── */}
          <View style={styles.headerRow}>
            <Text style={styles.title}>Pair Tyro Terminal</Text>
            <TouchableOpacity onPress={handleClose} disabled={phase === 'pairing'}>
              <Ionicons
                name="close"
                size={22}
                color={phase === 'pairing' ? '#444' : '#999'}
              />
            </TouchableOpacity>
          </View>

          {/* ── Status icon ──────────────────────────────── */}
          <View style={styles.iconWrap}>{phaseIcon}</View>

          {/* ── Status message ───────────────────────────── */}
          {statusMessage ? (
            <Text
              style={[
                styles.statusText,
                phase === 'failure' || phase === 'timeout' ? styles.statusError : null,
                phase === 'success' ? styles.statusSuccess : null,
              ]}
              numberOfLines={4}
            >
              {statusMessage}
            </Text>
          ) : (
            <Text style={styles.helpText}>
              Enter the Merchant ID (MID) and Terminal ID (TID) printed on the Tyro terminal or
              provided by Tyro support, then tap Pair.
            </Text>
          )}

          {phase === 'pairing' && remainingSeconds > 0 && (
            <Text style={styles.countdown}>Waiting up to {remainingSeconds}s…</Text>
          )}

          {phase === 'success' && maskedKey && (
            <View style={styles.keyBox}>
              <Text style={styles.keyLabel}>Integration key</Text>
              <Text style={styles.keyValue}>{maskedKey}</Text>
              <Text style={styles.keyHint}>Stored securely on this device.</Text>
            </View>
          )}

          {/* ── MID / TID inputs ─────────────────────────── */}
          {phase !== 'success' && (
            <View style={styles.inputSection}>
              <Text style={styles.label}>Merchant ID (MID)</Text>
              <TextInput
                style={styles.input}
                value={mid}
                onChangeText={setMid}
                placeholder="e.g. 12345678"
                placeholderTextColor="#555"
                keyboardType="number-pad"
                editable={canEditFields}
                maxLength={16}
                autoCorrect={false}
                autoCapitalize="none"
              />

              <Text style={styles.label}>Terminal ID (TID)</Text>
              <TextInput
                style={styles.input}
                value={tid}
                onChangeText={setTid}
                placeholder="e.g. 87654321"
                placeholderTextColor="#555"
                keyboardType="number-pad"
                editable={canEditFields}
                maxLength={16}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>
          )}

          {/* ── Action buttons ───────────────────────────── */}
          <View style={styles.buttonRow}>
            {phase !== 'success' ? (
              <TouchableOpacity
                style={[styles.pairBtn, !canPair && styles.pairBtnDisabled]}
                onPress={startPairing}
                disabled={!canPair}
              >
                {phase === 'pairing' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="link" size={18} color="#fff" />
                    <Text style={styles.pairBtnText}>
                      {phase === 'failure' || phase === 'timeout' ? 'Retry Pairing' : 'Pair Terminal'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.pairBtnText}>Done</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.branding}>Powered by Tyro EFTPOS</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
    height: 72,
  },
  statusText: {
    color: '#ddd',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
    minHeight: 40,
  },
  statusError: {
    color: '#f87171',
  },
  statusSuccess: {
    color: '#86efac',
  },
  helpText: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 18,
  },
  countdown: {
    color: '#a5b4fc',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  keyBox: {
    backgroundColor: '#0f0f1a',
    borderWidth: 1,
    borderColor: '#22c55e',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    alignItems: 'center',
  },
  keyLabel: {
    color: '#888',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  keyValue: {
    color: '#86efac',
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginVertical: 4,
  },
  keyHint: {
    color: '#555',
    fontSize: 10,
  },
  inputSection: {
    marginTop: 8,
    marginBottom: 12,
  },
  label: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#0f0f1a',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  buttonRow: {
    marginTop: 8,
  },
  pairBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  pairBtnDisabled: {
    backgroundColor: '#2a2a3a',
  },
  pairBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  doneBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  branding: {
    marginTop: 16,
    color: '#555',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
});
