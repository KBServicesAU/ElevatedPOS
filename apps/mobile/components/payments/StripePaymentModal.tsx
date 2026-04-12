/**
 * StripePaymentModal
 *
 * Handles Stripe Terminal Tap to Pay on Android (localMobile reader).
 * Uses the device's own NFC — no external hardware needed.
 *
 * Flow:
 *  1. Initialize Stripe Terminal SDK
 *  2. Discover + connect localMobile reader
 *  3. Create PaymentIntent on backend (/api/v1/stripe/payment-intent)
 *  4. collectPaymentMethod (shows "Tap card" UI on screen)
 *  5. confirmPaymentIntent
 *  6. Callback with result
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStripeTerminal } from '@stripe/stripe-react-native';
import { useDeviceStore } from '../../store/device';

export interface StripePaymentResult {
  approved: boolean;
  paymentIntentId?: string;
  amount?: number;
  cardBrand?: string;
  cardLast4?: string;
  declineCode?: string;
  errorMessage?: string;
}

interface Props {
  visible: boolean;
  amountCents: number;
  orderId?: string;
  currency?: string;
  onApproved: (result: StripePaymentResult) => void;
  onDeclined: (result: StripePaymentResult) => void;
  onCancel: () => void;
}

type PayStep =
  | 'initializing'
  | 'discovering'
  | 'connecting'
  | 'creating_intent'
  | 'waiting_tap'
  | 'processing'
  | 'approved'
  | 'declined'
  | 'error';

export function StripePaymentModal({
  visible, amountCents, orderId, currency = 'aud',
  onApproved, onDeclined, onCancel,
}: Props) {
  const { identity } = useDeviceStore();
  const [step, setStep] = useState<PayStep>('initializing');
  const [statusMessage, setStatusMessage] = useState('Initializing…');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const cancelledRef = useRef(false);
  const API_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'https://api.elevatedpos.com.au';

  const {
    initialize,
    discoverReaders,
    connectLocalMobileReader,
    createPaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    cancelCollectPaymentMethod,
    connectedReader,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: async (readers) => {
      if (readers.length === 0 || cancelledRef.current) return;
      setStep('connecting');
      setStatusMessage('Connecting to reader…');
      const { error } = await connectLocalMobileReader({ reader: readers[0]! });
      if (error) {
        setStep('error');
        setErrorMessage(error.message);
      }
    },
  });

  // Pulse animation for the tap circle
  useEffect(() => {
    if (step !== 'waiting_tap') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [step, pulseAnim]);

  const runPayment = useCallback(async () => {
    if (!identity?.deviceToken || cancelledRef.current) return;
    cancelledRef.current = false;

    try {
      // Step 1: Initialize
      setStep('initializing');
      setStatusMessage('Initializing terminal…');
      const { error: initErr } = await initialize({
        fetchConnectionToken: async () => {
          const res = await fetch(`${API_BASE}/api/v1/stripe/connection-token`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${identity.deviceToken}` },
          });
          const data = await res.json() as { secret: string };
          return data.secret;
        },
      });
      if (initErr || cancelledRef.current) {
        if (initErr) { setStep('error'); setErrorMessage(initErr.message); }
        return;
      }

      // Step 2: Discover readers
      setStep('discovering');
      setStatusMessage('Discovering Tap to Pay reader…');
      const { error: discErr } = await discoverReaders({
        discoveryMethod: 'localMobile',
        simulated: false,
      });
      if (discErr && !cancelledRef.current) {
        setStep('error');
        setErrorMessage(discErr.message);
        return;
      }

      // (onUpdateDiscoveredReaders fires → connect)
      // Wait for connection
      await new Promise<void>((res) => {
        const check = setInterval(() => {
          if (connectedReader || step === 'error' || cancelledRef.current) {
            clearInterval(check);
            res();
          }
        }, 200);
      });

      if (cancelledRef.current || step === 'error') return;

      // Step 3: Create payment intent on backend
      setStep('creating_intent');
      setStatusMessage('Creating payment intent…');
      const piRes = await fetch(`${API_BASE}/api/v1/stripe/payment-intent`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${identity.deviceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amountCents, currency, orderId }),
      });
      if (!piRes.ok) {
        const err = await piRes.json() as { error?: string };
        setStep('error');
        setErrorMessage(err.error ?? 'Failed to create payment intent');
        return;
      }
      const piData = await piRes.json() as { data: { id: string } };
      const paymentIntentId = piData.data.id;

      if (cancelledRef.current) return;

      // Step 4: Collect payment (tap)
      setStep('waiting_tap');
      setStatusMessage('Tap, insert, or swipe card');
      const { paymentIntent: collected, error: collectErr } = await collectPaymentMethod({
        paymentIntentId,
      });
      if (collectErr || cancelledRef.current) {
        if (!cancelledRef.current) {
          setStep('declined');
          setErrorMessage(collectErr?.message ?? 'Payment collection failed');
          onDeclined({ approved: false, paymentIntentId, declineCode: collectErr?.code?.toString(), errorMessage: collectErr?.message });
        }
        return;
      }

      // Step 5: Confirm
      setStep('processing');
      setStatusMessage('Processing payment…');
      const { paymentIntent: confirmed, error: confirmErr } = await confirmPaymentIntent({
        paymentIntent: collected!,
      });
      if (confirmErr) {
        setStep('declined');
        setErrorMessage(confirmErr.message);
        onDeclined({ approved: false, paymentIntentId, declineCode: confirmErr.code?.toString(), errorMessage: confirmErr.message });
        return;
      }

      // Approved!
      setStep('approved');
      setStatusMessage('Payment approved!');
      const charge = (confirmed as any)?.charges?.data?.[0];
      const paymentMethod = charge?.payment_method_details?.card_present;
      onApproved({
        approved: true,
        paymentIntentId: confirmed?.id ?? paymentIntentId,
        amount: confirmed?.amount,
        cardBrand: paymentMethod?.brand,
        cardLast4: paymentMethod?.last4,
      });

    } catch (err) {
      if (!cancelledRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        setStep('error');
        setErrorMessage(msg);
      }
    }
  }, [identity, amountCents, currency, orderId, API_BASE, initialize, discoverReaders, collectPaymentMethod, confirmPaymentIntent, connectedReader, step]);

  useEffect(() => {
    if (visible) {
      cancelledRef.current = false;
      runPayment();
    }
    return () => { cancelledRef.current = true; };
  }, [visible]);

  function handleCancel() {
    cancelledRef.current = true;
    if (step === 'waiting_tap') {
      cancelCollectPaymentMethod().catch(() => {});
    }
    onCancel();
  }

  const amountStr = `$${(amountCents / 100).toFixed(2)}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleCancel}>
      <View style={s.overlay}>
        <View style={s.card}>
          <Text style={s.title}>Card Payment</Text>
          <Text style={s.amount}>{amountStr}</Text>

          <View style={s.iconArea}>
            {step === 'waiting_tap' ? (
              <Animated.View style={[s.tapCircle, { transform: [{ scale: pulseAnim }] }]}>
                <Ionicons name="card" size={56} color="#6366f1" />
              </Animated.View>
            ) : step === 'approved' ? (
              <View style={[s.tapCircle, s.approvedCircle]}>
                <Ionicons name="checkmark-circle" size={56} color="#22c55e" />
              </View>
            ) : step === 'declined' || step === 'error' ? (
              <View style={[s.tapCircle, s.errorCircle]}>
                <Ionicons name="close-circle" size={56} color="#ef4444" />
              </View>
            ) : (
              <ActivityIndicator size="large" color="#6366f1" />
            )}
          </View>

          <Text style={s.status}>{errorMessage ?? statusMessage}</Text>

          {(step === 'waiting_tap' || step === 'initializing' || step === 'discovering' || step === 'connecting' || step === 'creating_intent') && (
            <TouchableOpacity style={s.cancelBtn} onPress={handleCancel} activeOpacity={0.8}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          )}

          {(step === 'declined' || step === 'error') && (
            <View style={s.row}>
              <TouchableOpacity style={s.retryBtn} onPress={() => runPayment()} activeOpacity={0.8}>
                <Text style={s.retryBtnText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={handleCancel} activeOpacity={0.8}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  card: { width: 340, backgroundColor: '#1a1a2e', borderRadius: 24, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a3a' },
  title: { fontSize: 18, fontWeight: '700', color: '#aaa', marginBottom: 8 },
  amount: { fontSize: 42, fontWeight: '900', color: '#fff', marginBottom: 32 },
  iconArea: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  tapCircle: { width: 110, height: 110, borderRadius: 55, backgroundColor: '#1e1e3a', borderWidth: 2, borderColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  approvedCircle: { borderColor: '#22c55e', backgroundColor: '#0d2a1a' },
  errorCircle: { borderColor: '#ef4444', backgroundColor: '#2a0d0d' },
  status: { fontSize: 16, color: '#ccc', textAlign: 'center', marginBottom: 24, minHeight: 44 },
  row: { flexDirection: 'row', gap: 12 },
  cancelBtn: { paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, borderWidth: 1, borderColor: '#444', marginTop: 4 },
  cancelBtnText: { fontSize: 15, color: '#999', fontWeight: '700' },
  retryBtn: { paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, backgroundColor: '#6366f1', marginTop: 4 },
  retryBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
