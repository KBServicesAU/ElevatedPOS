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

/**
 * ANZ Worldline TIM payment modal.
 *
 * Makes a direct HTTP purchase request to the ANZ terminal over the
 * local network (TIM — Terminal Integration Module). The fetch blocks
 * while the customer interacts with the terminal (up to ~90 s).
 *
 * No Close X, no backdrop dismiss — the operator must use Cancel.
 */

export interface AnzPaymentResult {
  approved: boolean;
  transactionId?: string;
  authCode?: string;
  cardType?: string;
  cardLast4?: string;
  responseCode: string;
  responseText: string;
  receiptData?: {
    merchantReceipt?: string;
    customerReceipt?: string;
  };
}

export interface AnzPaymentModalProps {
  visible: boolean;
  /** Sale amount in dollars */
  amount: number;
  /** ANZ terminal config from server (terminalIp is required) */
  config: { terminalIp: string; terminalPort?: number };
  /** Reference ID to associate with the transaction (e.g. local order timestamp) */
  referenceId?: string;
  title?: string;
  onApproved: (result: AnzPaymentResult) => void;
  onDeclined: (result: AnzPaymentResult) => void;
  onCancelled: () => void;
  onError: (message: string) => void;
}

type Phase = 'connecting' | 'waiting' | 'approved' | 'declined' | 'cancelled' | 'error';

export function AnzPaymentModal({
  visible,
  amount,
  config,
  referenceId,
  title = 'Card Payment',
  onApproved,
  onDeclined,
  onCancelled,
  onError,
}: AnzPaymentModalProps) {
  const [phase, setPhase] = useState<Phase>('connecting');
  const [statusText, setStatusText] = useState('Connecting to terminal…');
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      startedRef.current = false;
      setPhase('connecting');
      setStatusText('Connecting to terminal…');
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    runTransaction();
  }, [visible]);

  async function runTransaction() {
    const ip = config.terminalIp.trim();
    const port = config.terminalPort || 8080;
    const amountCents = Math.round(amount * 100);
    const refId = referenceId ?? `POS-${Date.now()}`;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setPhase('connecting');
      setStatusText('Connecting to terminal…');

      // Small delay so the modal is fully visible before the request fires
      await new Promise((r) => setTimeout(r, 400));
      if (controller.signal.aborted) return;

      setPhase('waiting');
      setStatusText('Waiting for card on terminal…');

      const res = await fetch(`http://${ip}:${port}/v1/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionType: 'purchase',
          amount: amountCents,
          referenceId: refId,
        }),
        signal: controller.signal,
      });

      let data: Record<string, unknown> = {};
      const text = await res.text().catch(() => '');
      try { data = JSON.parse(text); } catch { /* use empty */ }

      const responseCode = (data['responseCode'] as string) ?? String(res.status);
      const responseText = (data['responseText'] as string) ?? (res.ok ? 'OK' : 'Error');
      const approved = responseCode === '00';

      const result: AnzPaymentResult = {
        approved,
        responseCode,
        responseText,
        transactionId: data['transactionId'] as string | undefined,
        authCode: data['authorizationCode'] as string | undefined,
        cardType: data['cardType'] as string | undefined,
        cardLast4: (data['maskedPan'] as string | undefined)?.slice(-4),
        receiptData: data['receiptData'] as AnzPaymentResult['receiptData'],
      };

      if (approved) {
        setPhase('approved');
        setStatusText('Payment approved!');
        setTimeout(() => onApproved(result), 800);
      } else {
        setPhase('declined');
        setStatusText(`Declined: ${responseText}`);
        setTimeout(() => onDeclined(result), 1500);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        setPhase('cancelled');
        setStatusText('Transaction cancelled.');
        setTimeout(() => onCancelled(), 800);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes('abort') || msg.includes('timeout') || msg.includes('network');
      setPhase('error');
      setStatusText(
        isTimeout
          ? 'Could not reach the terminal. Check that the device is on the same network.'
          : msg,
      );
      setTimeout(() => onError(msg), 2000);
    } finally {
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  const isTerminal = phase === 'approved' || phase === 'declined' || phase === 'cancelled' || phase === 'error';
  const isProcessing = phase === 'connecting' || phase === 'waiting';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      // No onRequestClose — operator must use Cancel
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
                {phase === 'connecting' ? (
                  <ActivityIndicator size="large" color="#6366f1" />
                ) : (
                  <Ionicons name="card-outline" size={44} color="#6366f1" />
                )}
              </View>
            )}
          </View>

          {/* Title */}
          <Text style={styles.title}>{title}</Text>

          {/* Amount */}
          <Text style={styles.amount}>${amount.toFixed(2)}</Text>

          {/* Status */}
          <Text
            style={[
              styles.status,
              phase === 'approved' && styles.statusGreen,
              (phase === 'declined' || phase === 'error') && styles.statusRed,
            ]}
          >
            {statusText}
          </Text>

          {/* Provider label */}
          <Text style={styles.provider}>ANZ Worldline</Text>

          {/* Cancel — only while in flight */}
          {isProcessing && (
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.8}>
              <Ionicons name="close-outline" size={16} color="#888" />
              <Text style={styles.cancelBtnText}>Cancel Transaction</Text>
            </TouchableOpacity>
          )}

          {/* Spacer when terminal (avoids layout jump) */}
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
  iconGreen: { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: '#22c55e' },
  iconRed: { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: '#ef4444' },
  iconGrey: { backgroundColor: 'rgba(136,136,136,0.12)', borderColor: '#444' },
  iconIndigo: { backgroundColor: 'rgba(99,102,241,0.12)', borderColor: '#6366f1' },
  title: { color: '#aaa', fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  amount: { color: '#fff', fontSize: 36, fontWeight: '900', marginBottom: 8 },
  status: { color: '#888', fontSize: 14, fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  statusGreen: { color: '#22c55e' },
  statusRed: { color: '#ef4444' },
  provider: { color: '#444', fontSize: 11, marginBottom: 20 },
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
