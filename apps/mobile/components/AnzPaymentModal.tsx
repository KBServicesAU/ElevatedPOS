import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAnzBridge, AnzBridgeError } from './AnzBridgeHost';
import { useTillStore } from '../store/till';

/**
 * ANZ Worldline TIM API payment modal (Android).
 *
 * v2.7.16: the WebView lives at the POS layout level (AnzBridgeHost) so
 * the terminal stays connected for the life of the shift. This modal
 * just drives the already-connected terminal through a purchase.
 *
 * The till MUST be open before a card transaction can run — the bridge
 * rejects transactions with "Till is not open" otherwise. We surface
 * that as a friendly message and bail.
 */

export interface AnzPaymentResult {
  approved: boolean;
  transactionRef?: string;
  authCode?: string;
  cardType?: string;
  cardLast4?: string;
  rrn?: string;
  declineCode?: string;
  declineReason?: string;
  merchantReceipt?: string;
  customerReceipt?: string;
}

export interface AnzPaymentModalProps {
  visible: boolean;
  /** Sale amount in dollars (e.g. 12.50) */
  amount: number;
  /** Accepted for compat — the bridge reads config from useAnzStore. */
  config?: { terminalIp: string; terminalPort?: number; integratorId?: string };
  /** Reference ID to include in the transaction (e.g. order ID) */
  referenceId?: string;
  title?: string;
  onApproved: (result: AnzPaymentResult) => void;
  onDeclined: (result: AnzPaymentResult) => void;
  onCancelled: () => void;
  onError: (message: string) => void;
}

type Phase = 'idle' | 'connecting' | 'waiting' | 'approved' | 'declined' | 'cancelled' | 'error';

export function AnzPaymentModal({
  visible,
  amount,
  referenceId,
  title = 'Card Payment',
  onApproved,
  onDeclined,
  onCancelled,
  onError,
}: AnzPaymentModalProps) {
  const bridge = useAnzBridge();
  const tillOpen = useTillStore((s) => s.isOpen);

  const [phase, setPhase] = useState<Phase>('idle');
  const [statusText, setStatusText] = useState('Starting…');
  const startedRef = useRef(false);
  const cancelledRef = useRef(false);

  // Subscribe to status messages from the bridge while visible.
  useEffect(() => {
    if (!visible) return;
    return bridge.onStatus((m) => {
      const lower = m.toLowerCase();
      if (lower.includes('connect')) setPhase('connecting');
      else setPhase((p) => (p === 'connecting' ? 'waiting' : p));
      setStatusText(m);
    });
  }, [visible, bridge]);

  // When the modal opens, kick off the transaction exactly once.
  useEffect(() => {
    if (!visible) {
      startedRef.current = false;
      cancelledRef.current = false;
      setPhase('idle');
      setStatusText('Starting…');
      return;
    }

    if (!tillOpen) {
      const msg = 'Open the till from the More menu before taking card payments.';
      setPhase('error');
      setStatusText(msg);
      setTimeout(() => onError(msg), 1500);
      return;
    }

    if (startedRef.current) return;
    startedRef.current = true;

    setPhase('connecting');
    setStatusText('Contacting terminal…');

    const amountCents = Math.round(amount * 100);
    const ref = referenceId ?? `POS-${Date.now()}`;
    bridge
      .transaction(amountCents, ref)
      .then((result) => {
        if (cancelledRef.current) return;
        setPhase('approved');
        setStatusText('Payment approved!');
        setTimeout(() => {
          onApproved({
            approved:        true,
            transactionRef:  result.transactionRef  ?? undefined,
            authCode:        result.authCode        ?? undefined,
            cardLast4:       result.maskedPan?.slice(-4),
            cardType:        result.cardType        ?? undefined,
            rrn:             result.rrn             ?? undefined,
            merchantReceipt: result.merchantReceipt ?? undefined,
            customerReceipt: result.customerReceipt ?? undefined,
          });
        }, 800);
      })
      .catch((err: Error) => {
        if (cancelledRef.current) return;
        const errMsg = err?.message ?? 'Terminal error';
        // v2.7.31 — use the TimException category from the SDK instead
        // of regex-matching the raw message. The bridge now wraps errors
        // in AnzBridgeError with `.category` ∈ {declined, declinedNotSupported,
        // aborted, ...}. Old regex path retained as a fallback for any
        // non-bridge error that might slip through.
        const anzErr = err instanceof AnzBridgeError ? err : null;

        if (anzErr?.isAborted || /cancel/i.test(errMsg)) {
          setPhase('cancelled');
          setStatusText('Transaction cancelled.');
          setTimeout(() => onCancelled(), 600);
          return;
        }

        if (anzErr?.isNotSupported) {
          // "Not supported" is NOT a card decline — it's the acquirer
          // saying this card brand / BIN / transaction type isn't
          // enabled on this merchant. Most common cause: merchant hasn't
          // enrolled the card brand with ANZ, or the terminal firmware
          // doesn't support contactless for this amount.
          setPhase('error');
          setStatusText('Transaction not supported');
          setTimeout(
            () =>
              onError(
                'ANZ rejected the transaction as "Not Supported". This usually means the card brand or transaction type is not enrolled on your merchant profile. Try a different card or call ANZ to enable this card brand.',
              ),
            1800,
          );
          return;
        }

        if (anzErr?.isDeclined || /decline/i.test(errMsg)) {
          setPhase('declined');
          setStatusText(errMsg);
          setTimeout(
            () =>
              onDeclined({
                approved: false,
                declineReason: errMsg,
                declineCode: anzErr?.code != null ? String(anzErr.code) : undefined,
              }),
            1500,
          );
          return;
        }

        setPhase('error');
        setStatusText(errMsg);
        setTimeout(() => onError(errMsg), 1800);
      });
  }, [visible, tillOpen, amount, referenceId, bridge, onApproved, onDeclined, onCancelled, onError]);

  function handleCancel() {
    cancelledRef.current = true;
    bridge.cancel();
    setPhase('cancelled');
    setStatusText('Transaction cancelled.');
    setTimeout(() => onCancelled(), 600);
  }

  const isTerminal  = phase === 'approved' || phase === 'declined' || phase === 'cancelled' || phase === 'error';
  const isProcessing = phase === 'idle'  || phase === 'connecting' || phase === 'waiting';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Icon */}
          <View style={styles.iconWrap}>
            {phase === 'approved' ? (
              <View style={[styles.iconCircle, styles.iconGreen]}>
                <Ionicons name="checkmark-circle" size={44} color="#22c55e" />
              </View>
            ) : phase === 'declined' || phase === 'error' ? (
              <View style={[styles.iconCircle, styles.iconRed]}>
                <Ionicons name="close-circle" size={44} color="#ef4444" />
              </View>
            ) : phase === 'cancelled' ? (
              <View style={[styles.iconCircle, styles.iconGrey]}>
                <Ionicons name="ban-outline" size={44} color="#888" />
              </View>
            ) : (
              <View style={[styles.iconCircle, styles.iconIndigo]}>
                {phase === 'idle' || phase === 'connecting' ? (
                  <ActivityIndicator size="large" color="#6366f1" />
                ) : (
                  <Ionicons name="card-outline" size={44} color="#6366f1" />
                )}
              </View>
            )}
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.amount}>${amount.toFixed(2)}</Text>
          <Text
            style={[
              styles.status,
              phase === 'approved' && styles.statusGreen,
              (phase === 'declined' || phase === 'error') && styles.statusRed,
            ]}
          >
            {statusText}
          </Text>
          <Text style={styles.provider}>ANZ Worldline</Text>

          {isProcessing && (
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.8}>
              <Ionicons name="close-outline" size={16} color="#888" />
              <Text style={styles.cancelBtnText}>Cancel Transaction</Text>
            </TouchableOpacity>
          )}

          {isTerminal && <View style={{ height: 44 }} />}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#141425',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    padding: 28,
    alignItems: 'center',
  },
  iconWrap: { marginBottom: 20 },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  iconGreen:  { backgroundColor: 'rgba(34,197,94,0.12)',  borderColor: '#22c55e' },
  iconRed:    { backgroundColor: 'rgba(239,68,68,0.12)',  borderColor: '#ef4444' },
  iconGrey:   { backgroundColor: 'rgba(136,136,136,0.12)', borderColor: '#444'  },
  iconIndigo: { backgroundColor: 'rgba(99,102,241,0.12)', borderColor: '#6366f1' },
  title:       { color: '#aaa', fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  amount:      { color: '#fff', fontSize: 36, fontWeight: '900', marginBottom: 8 },
  status:      { color: '#888', fontSize: 14, fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  statusGreen: { color: '#22c55e' },
  statusRed:   { color: '#ef4444' },
  provider:    { color: '#444', fontSize: 11, marginBottom: 20 },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelBtnText: { color: '#888', fontWeight: '600', fontSize: 14 },
});
