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
import {
  addTyroListener,
  tyroAnswerQuestion,
  tyroCancelTransaction,
  type TyroQuestionEvent,
  type TyroReceiptEvent,
  type TyroStatusMessageEvent,
  type TyroTransactionResult,
} from '../modules/tyro-tta';

/**
 * Headless POS-controlled transaction modal.
 *
 * This component meets the iClient.Retail.Headless cert requirements:
 *   - Displays all status messages from statusCallback.
 *   - Surfaces questions from questionCallback with their option buttons.
 *   - Provides a Cancel button that calls cancelCurrentTransaction().
 *   - No Close X button; taps outside the modal do not dismiss it.
 *   - Remains visible until transactionCompleteCallback fires.
 *
 * Integration: mount the modal at the root of the POS screen and open
 * it when a Tyro transaction begins. The parent is responsible for
 * starting the transaction (purchase / refund / etc.) via the
 * `modules/tyro-tta` helpers *after* the modal is visible — the modal
 * just listens for events.
 */

export type TyroModalPhase =
  | 'idle'
  | 'starting'
  | 'in_progress'
  | 'question'
  | 'cancelling'
  | 'approved'
  | 'declined'
  | 'failed';

export interface TyroTransactionOutcome {
  result: TyroTransactionResult;
  /** Merchant receipt text captured from the receiptCallback, if any. */
  merchantReceipt?: string;
  /** Whether the terminal asked for a merchant-copy signature. */
  signatureRequired?: boolean;
}

export interface TyroTransactionModalProps {
  visible: boolean;
  amount: number; // dollars for display
  title?: string; // e.g. "Purchase", "Refund"
  /** Called once the transaction is complete (any outcome). */
  onComplete: (outcome: TyroTransactionOutcome) => void;
  /** Called when the modal wants to unmount (post-complete). */
  onClose: () => void;
}

export function TyroTransactionModal({
  visible,
  amount,
  title = 'Tyro Payment',
  onComplete,
  onClose,
}: TyroTransactionModalProps) {
  const [phase, setPhase] = useState<TyroModalPhase>('idle');
  const [statusMessage, setStatusMessage] = useState('Connecting to Tyro terminal...');
  const [question, setQuestion] = useState<TyroQuestionEvent | null>(null);
  const [merchantReceipt, setMerchantReceipt] = useState<string | null>(null);
  const [signatureRequired, setSignatureRequired] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const completedRef = useRef(false);
  // Ref versions of the receipt so the latest values are available inside
  // the onTransactionComplete handler (which captures stale state).
  const merchantReceiptRef = useRef<string | null>(null);
  const signatureRequiredRef = useRef<boolean>(false);

  // ── Reset state when the modal (re-)opens ───────────────────────
  useEffect(() => {
    if (!visible) return;
    completedRef.current = false;
    merchantReceiptRef.current = null;
    signatureRequiredRef.current = false;
    setPhase('starting');
    setStatusMessage('Starting transaction...');
    setQuestion(null);
    setMerchantReceipt(null);
    setSignatureRequired(false);
    setErrorMessage(null);
  }, [visible]);

  // ── Wire Tyro event listeners ───────────────────────────────────
  useEffect(() => {
    if (!visible) return;

    const subs = [
      addTyroListener('onStatusMessage', (e: TyroStatusMessageEvent) => {
        setStatusMessage(e.message || '');
        setPhase((p) => (p === 'question' ? p : 'in_progress'));
      }),
      addTyroListener('onQuestion', (e: TyroQuestionEvent) => {
        setQuestion(e);
        setPhase('question');
      }),
      addTyroListener('onReceipt', (e: TyroReceiptEvent) => {
        merchantReceiptRef.current = e.merchantReceipt || null;
        signatureRequiredRef.current = !!e.signatureRequired;
        setMerchantReceipt(e.merchantReceipt || null);
        setSignatureRequired(!!e.signatureRequired);
      }),
      addTyroListener('onTransactionComplete', (e) => {
        if (completedRef.current) return;
        completedRef.current = true;
        const result = e.response ?? { result: 'UNKNOWN' };
        const outcome = String(result.result || 'UNKNOWN').toUpperCase();
        if (outcome === 'APPROVED') {
          setPhase('approved');
          setStatusMessage('Approved');
        } else if (outcome === 'CANCELLED') {
          setPhase('declined');
          setStatusMessage('Cancelled');
        } else if (outcome === 'DECLINED') {
          setPhase('declined');
          setStatusMessage('Declined');
        } else {
          setPhase('failed');
          setStatusMessage(outcome);
          if (result.errorMessage) setErrorMessage(result.errorMessage);
        }
        setQuestion(null);
        // Brief pause so the merchant can read the outcome before the
        // modal dismisses. Purchase flow can continue in onComplete.
        setTimeout(
          () =>
            onComplete({
              result,
              merchantReceipt: merchantReceiptRef.current ?? undefined,
              signatureRequired: signatureRequiredRef.current,
            }),
          1200,
        );
      }),
    ];

    return () => {
      subs.forEach((s) => s.remove());
    };
  }, [visible, onComplete]);

  function handleAnswer(option: string) {
    if (!question) return;
    setPhase('in_progress');
    setQuestion(null);
    setStatusMessage('Processing...');
    tyroAnswerQuestion(option);
  }

  function handleCancel() {
    if (phase === 'cancelling') return;
    setPhase('cancelling');
    setStatusMessage('Cancelling...');
    tyroCancelTransaction();
  }

  const canCancel =
    phase === 'starting' ||
    phase === 'in_progress' ||
    phase === 'question' ||
    phase === 'cancelling';

  const colorForPhase = (() => {
    switch (phase) {
      case 'approved':  return '#22c55e';
      case 'declined':  return '#ef4444';
      case 'failed':    return '#ef4444';
      case 'question':  return '#f59e0b';
      default:          return '#6366f1';
    }
  })();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Cert rule: the merchant must not be able to dismiss mid-flight.
      onRequestClose={() => {
        if (!canCancel && (phase === 'approved' || phase === 'declined' || phase === 'failed')) {
          onClose();
        }
        // Otherwise swallow — prevents hardware back from closing.
      }}
      statusBarTranslucent
    >
      {/* Backdrop — tapping is intentionally a no-op during transactions */}
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* ── Header ─────────────────────────────────────── */}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.amount}>${amount.toFixed(2)}</Text>

          {/* ── Status / Spinner ───────────────────────────── */}
          <View style={[styles.statusCircle, { borderColor: colorForPhase }]}>
            {phase === 'approved' ? (
              <Ionicons name="checkmark" size={48} color={colorForPhase} />
            ) : phase === 'declined' || phase === 'failed' ? (
              <Ionicons name="close" size={48} color={colorForPhase} />
            ) : (
              <ActivityIndicator size="large" color={colorForPhase} />
            )}
          </View>

          <Text style={[styles.statusText, { color: colorForPhase }]} numberOfLines={3}>
            {statusMessage}
          </Text>
          {errorMessage ? (
            <Text style={styles.errorText} numberOfLines={3}>{errorMessage}</Text>
          ) : null}

          {/* ── Question prompt ────────────────────────────── */}
          {question && phase === 'question' && (
            <View style={styles.questionBox}>
              <Text style={styles.questionText}>{question.text}</Text>
              <View style={styles.optionsRow}>
                {question.options.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={styles.optionBtn}
                    onPress={() => handleAnswer(opt)}
                  >
                    <Text style={styles.optionText}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ── Signature indicator ────────────────────────── */}
          {signatureRequired && merchantReceipt && (
            <Text style={styles.signatureHint}>
              Signature required on merchant copy
            </Text>
          )}

          {/* ── Cancel button (bottom, never a Close X) ─────── */}
          {canCancel && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancel}
              disabled={phase === 'cancelling'}
            >
              <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
              <Text style={styles.cancelText}>Cancel Transaction</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.branding}>Powered by Tyro EFTPOS</Text>
        </View>
      </View>
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
    maxWidth: 420,
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  title: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  amount: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '900',
    marginTop: 4,
    marginBottom: 24,
  },
  statusCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    minHeight: 22,
    marginBottom: 6,
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  questionBox: {
    width: '100%',
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#0f0f1a',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  questionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  optionBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    minWidth: 90,
  },
  optionText: {
    color: '#0a0a0f',
    fontWeight: '800',
    fontSize: 14,
    textAlign: 'center',
  },
  signatureHint: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
  },
  cancelBtn: {
    marginTop: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cancelText: {
    color: '#ef4444',
    fontWeight: '700',
    fontSize: 13,
  },
  branding: {
    marginTop: 18,
    color: '#666',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
});
