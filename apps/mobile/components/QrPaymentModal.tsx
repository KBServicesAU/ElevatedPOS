/**
 * v2.7.76 — QR-pay modal.
 *
 * The merchant's customer-screen flow: staff picks "QR Pay", we open
 * a Stripe Checkout Session, render the session URL as a QR code, and
 * poll /api/stripe/qr-status for completion. The customer scans with
 * their phone, taps Apple Pay / Google Pay / card on Stripe's hosted
 * page, and the modal flips to "Paid" within ~2s of the webhook
 * landing on Stripe's side.
 *
 * The modal owns:
 *   • Session creation on mount (fires once)
 *   • QR rendering of the returned URL
 *   • 2s polling loop with ~1m hard cap before declaring "took too long"
 *   • Optional auto-cancel of the Stripe session if the operator
 *     dismisses (so it can't sit "open" on Stripe's side forever)
 *
 * The parent component owns the actual sale completion — we just
 * report the outcome via callbacks, mirroring TyroTransactionModal /
 * AnzPaymentModal.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useDeviceStore } from '../store/device';
import { useAuthStore } from '../store/auth';
import { useCustomerDisplayStore } from '../store/customer-display';
import { QrCode } from './QrCode';

const POLL_INTERVAL_MS = 2_000;
/** How long we'll keep polling before giving up and surfacing
 *  "took too long" to the operator. The Stripe session itself lives
 *  for 30 minutes server-side, but waiting that long at the till
 *  isn't realistic — most QR payments resolve in under 30 seconds. */
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export interface QrPaymentResult {
  paymentIntentId: string;
  amountCents: number | null;
  paymentMethod: string | null;
  /** The original Checkout Session id, useful for refunds + audit. */
  sessionId: string;
  /** v2.7.77 — tip the customer added on the QR-pay step, in cents.
   *  0 if no tip was selected (or tipPercentages was empty). Reported
   *  back so handleCharge can include it in the receipt + reporting. */
  tipCents: number;
}

interface QrPaymentModalProps {
  visible: boolean;
  /** Base amount in cents (cart subtotal). Tip is added on top before
   *  the Stripe Checkout Session is created. */
  amountCents: number;
  /** Optional human-friendly order ref that shows on the customer's
   *  Stripe Checkout page ("Order #1042"). */
  orderRef?: string;
  /** Optional location name shown beneath the order ref on Stripe's
   *  hosted page. */
  locationName?: string;
  /** v2.7.77 — Tip percentages to show as quick buttons. Pass `[]`
   *  to skip the tip step entirely. Defaults to [10, 15, 20] which
   *  matches what most AU hospitality kiosks offer. */
  tipPercentages?: number[];
  onApproved: (result: QrPaymentResult) => void;
  onCancelled: () => void;
  onError: (message: string) => void;
}

type Phase = 'tip_select' | 'creating' | 'awaiting_scan' | 'paid' | 'expired' | 'error';

export function QrPaymentModal({
  visible,
  amountCents,
  orderRef,
  locationName,
  tipPercentages = [10, 15, 20],
  onApproved,
  onCancelled,
  onError,
}: QrPaymentModalProps) {
  const showTipStep = tipPercentages.length > 0;
  const [phase, setPhase] = useState<Phase>(showTipStep ? 'tip_select' : 'creating');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [session, setSession] = useState<{ id: string; url: string; expiresAt: number | null } | null>(null);
  /** Tip the customer chose (cents). 0 if tip step is skipped. */
  const [tipCents, setTipCents] = useState(0);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef<number>(0);
  /** Guard against double-fire of onApproved when a poll lands at the
   *  same instant the modal is being dismissed. */
  const settledRef = useRef(false);

  // Reset state on every (re)open.
  useEffect(() => {
    if (!visible) return;
    settledRef.current = false;
    setSession(null);
    setErrorMessage(null);
    setTipCents(0);
    setPhase(showTipStep ? 'tip_select' : 'creating');
    startedAtRef.current = Date.now();
  }, [visible, showTipStep]);

  // ── Session creation (after tip selection) ──────────────────────
  useEffect(() => {
    if (!visible) return;
    if (phase !== 'creating') return;

    let cancelled = false;
    (async () => {
      try {
        const base = process.env['EXPO_PUBLIC_API_URL'] ?? '';
        const token =
          useAuthStore.getState().employeeToken
          ?? useDeviceStore.getState().identity?.deviceToken
          ?? '';
        const res = await fetch(`${base}/api/stripe/qr-checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            // v2.7.77 — bake tip into the charged amount. Reported
            // back via QrPaymentResult.tipCents so handleCharge can
            // credit it on the receipt + tip-out reporting.
            amount: amountCents + tipCents,
            currency: 'aud',
            ...(orderRef ? { orderRef } : {}),
            ...(locationName ? { locationName } : {}),
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (cancelled) return;
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(errBody.error ?? `Checkout creation failed (HTTP ${res.status})`);
        }
        const data = await res.json() as {
          id: string;
          url: string;
          expiresAt: number | null;
        };
        if (!data.url || !data.id) {
          throw new Error('Checkout session response missing url / id.');
        }
        setSession({ id: data.id, url: data.url, expiresAt: data.expiresAt ?? null });
        setPhase('awaiting_scan');
        // v2.7.77 — mirror the QR to the customer-facing secondary
        // display if one is configured. Native module renders a
        // bigger QR + amount; if the build doesn't have the
        // showQrPay native method yet, the store falls back to
        // showing a "scan QR on POS" hint message.
        try {
          useCustomerDisplayStore.getState().showQrPay({
            url: data.url,
            amountCents,
            tipCents,
          });
        } catch {
          // best-effort
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, phase, amountCents, tipCents, orderRef, locationName]);

  // ── Polling loop ────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !session || phase !== 'awaiting_scan') return;

    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      if (Date.now() - startedAtRef.current > POLL_TIMEOUT_MS) {
        setErrorMessage('No payment received in time. Please try again.');
        setPhase('error');
        return;
      }
      try {
        const base = process.env['EXPO_PUBLIC_API_URL'] ?? '';
        const token =
          useAuthStore.getState().employeeToken
          ?? useDeviceStore.getState().identity?.deviceToken
          ?? '';
        const res = await fetch(
          `${base}/api/stripe/qr-status?id=${encodeURIComponent(session.id)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(8_000),
          },
        );
        if (stopped) return;
        if (!res.ok) {
          // Transient — keep polling. A persistent 4xx will eventually
          // hit the 5-minute cap above and surface as 'no payment'.
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }
        const body = await res.json() as {
          status: 'pending' | 'paid' | 'expired' | 'cancelled' | 'unknown';
          paymentIntentId: string | null;
          amountTotal: number | null;
          paymentMethod: string | null;
        };
        if (stopped) return;

        if (body.status === 'paid' && body.paymentIntentId && !settledRef.current) {
          settledRef.current = true;
          setPhase('paid');
          // Brief "Paid!" flash before handing back to the parent.
          setTimeout(() => {
            if (!stopped) {
              onApproved({
                sessionId: session.id,
                paymentIntentId: body.paymentIntentId!,
                amountCents: body.amountTotal,
                paymentMethod: body.paymentMethod,
                tipCents,
              });
            }
          }, 600);
          return;
        }
        if (body.status === 'cancelled') {
          if (!settledRef.current) {
            settledRef.current = true;
            onCancelled();
          }
          return;
        }
        if (body.status === 'expired') {
          setPhase('expired');
          return;
        }
        // pending / unknown — schedule another poll
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (stopped) return;
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [visible, session, phase, onApproved, onCancelled]);

  function handleManualCancel() {
    if (settledRef.current) return;
    settledRef.current = true;
    // v2.7.77 — clear QR from the customer display.
    try { useCustomerDisplayStore.getState().resetToIdle(); } catch { /* ignore */ }
    onCancelled();
  }

  function handleErrorDismiss() {
    if (settledRef.current) return;
    settledRef.current = true;
    try { useCustomerDisplayStore.getState().resetToIdle(); } catch { /* ignore */ }
    onError(errorMessage ?? 'QR payment failed.');
  }

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────
  // v2.7.77 — render tip-select step. Quick percentage buttons +
  // a "No tip" option. We compute tip in cents from the percentage
  // off `amountCents` so the customer's QR-pay total matches what
  // they expect.
  if (visible && phase === 'tip_select') {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={handleManualCancel}>
        <Pressable style={styles.overlay} onPress={handleManualCancel}>
          <Pressable style={styles.card} onPress={() => { /* swallow */ }}>
            <Text style={styles.title}>Add a tip?</Text>
            <Text style={styles.subtitle}>
              Customers can adjust on the next screen if they prefer.
            </Text>
            <Text style={styles.amount}>
              ${(amountCents / 100).toFixed(2)} <Text style={{ fontSize: 13, color: '#888', fontWeight: '700' }}>subtotal</Text>
            </Text>

            <View style={styles.tipGrid}>
              {tipPercentages.map((pct) => {
                const cents = Math.round((amountCents * pct) / 100);
                return (
                  <Pressable
                    key={pct}
                    style={styles.tipBtn}
                    onPress={() => {
                      setTipCents(cents);
                      setPhase('creating');
                    }}
                  >
                    <Text style={styles.tipBtnPct}>{pct}%</Text>
                    <Text style={styles.tipBtnAmount}>+${(cents / 100).toFixed(2)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={styles.tipSkipBtn}
              onPress={() => {
                setTipCents(0);
                setPhase('creating');
              }}
            >
              <Text style={styles.tipSkipText}>No tip</Text>
            </Pressable>

            <Pressable style={styles.cancelBtn} onPress={handleManualCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleManualCancel}>
      <Pressable style={styles.overlay} onPress={handleManualCancel}>
        <Pressable style={styles.card} onPress={() => { /* swallow */ }}>
          <Text style={styles.title}>Scan to Pay</Text>
          <Text style={styles.subtitle}>
            Use your phone's camera or wallet to scan the code below.
          </Text>

          <View style={styles.qrWrap}>
            {phase === 'creating' && (
              <View style={[styles.qrPlaceholder, { width: 260, height: 260 }]}>
                <ActivityIndicator size="large" color="#6366f1" />
                <Text style={styles.placeholderText}>Preparing checkout…</Text>
              </View>
            )}

            {phase === 'awaiting_scan' && session && (
              <QrCode value={session.url} size={260} />
            )}

            {phase === 'paid' && (
              <View style={[styles.qrPlaceholder, { width: 260, height: 260, backgroundColor: '#022c1a' }]}>
                <Text style={styles.paidIcon}>✓</Text>
                <Text style={[styles.placeholderText, { color: '#22c55e', fontWeight: '900', fontSize: 18, marginTop: 12 }]}>
                  Payment received
                </Text>
              </View>
            )}

            {phase === 'expired' && (
              <View style={[styles.qrPlaceholder, { width: 260, height: 260 }]}>
                <Text style={styles.placeholderText}>Session expired.</Text>
              </View>
            )}

            {phase === 'error' && (
              <View style={[styles.qrPlaceholder, { width: 260, height: 260 }]}>
                <Text style={[styles.placeholderText, { color: '#ef4444', textAlign: 'center', paddingHorizontal: 20 }]}>
                  {errorMessage ?? 'Could not start QR payment.'}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.amount}>
            ${((amountCents + tipCents) / 100).toFixed(2)} AUD
          </Text>
          {tipCents > 0 && (
            <Text style={styles.tipBreakdown}>
              ${(amountCents / 100).toFixed(2)} sale  +  ${(tipCents / 100).toFixed(2)} tip
            </Text>
          )}
          <Text style={styles.providerHint}>
            Apple Pay · Google Pay · Card · Link
          </Text>

          {phase === 'awaiting_scan' && (
            <Text style={styles.statusHint}>Waiting for customer payment…</Text>
          )}

          {(phase === 'awaiting_scan' || phase === 'creating') && (
            <Pressable style={styles.cancelBtn} onPress={handleManualCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          )}

          {phase === 'expired' && (
            <Pressable style={styles.cancelBtn} onPress={handleManualCancel}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </Pressable>
          )}

          {phase === 'error' && (
            <Pressable style={styles.cancelBtn} onPress={handleErrorDismiss}>
              <Text style={styles.cancelBtnText}>Dismiss</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
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
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 13,
    color: '#9aa',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
  },
  qrWrap: {
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 14,
  },
  qrPlaceholder: {
    backgroundColor: '#0d0d14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#888',
    fontSize: 13,
    marginTop: 10,
  },
  paidIcon: {
    fontSize: 64,
    color: '#22c55e',
    fontWeight: '900',
  },
  amount: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '900',
    marginTop: 18,
    letterSpacing: 0.5,
  },
  providerHint: {
    fontSize: 11,
    color: '#666',
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  statusHint: {
    fontSize: 12,
    color: '#22c55e',
    fontWeight: '700',
    marginTop: 14,
    letterSpacing: 0.5,
  },
  cancelBtn: {
    marginTop: 18,
    backgroundColor: '#0d0d14',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  cancelBtnText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '700',
  },
  // v2.7.77 — tip-select step
  tipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
    width: '100%',
  },
  tipBtn: {
    flex: 1,
    minWidth: 90,
    backgroundColor: '#0d0d14',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#22c55e44',
  },
  tipBtnPct: {
    fontSize: 22,
    color: '#22c55e',
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  tipBtnAmount: {
    fontSize: 12,
    color: '#9aa',
    marginTop: 4,
    fontWeight: '700',
  },
  tipSkipBtn: {
    marginTop: 12,
    width: '100%',
    backgroundColor: '#0d0d14',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  tipSkipText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '700',
  },
  tipBreakdown: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
