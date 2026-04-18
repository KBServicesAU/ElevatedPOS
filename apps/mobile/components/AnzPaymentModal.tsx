import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

/**
 * ANZ Worldline TIM API payment modal (Android).
 *
 * Uses a hidden WebView to run timapi.js (WebSocket/SIXml protocol).
 * The WebView communicates with the physical EFTPOS terminal on the
 * local network (ws://<ip>:80) via the ANZ TIM API JS SDK.
 *
 * ─── Required files ──────────────────────────────────────────────────────────
 * Place these two files in apps/mobile/assets/timapi/ :
 *   - timapi.js    (ANZ Worldline TIM API JS SDK)
 *   - timapi.wasm  (WebAssembly binary, loaded by timapi.js)
 *
 * Obtain from: https://start.portal.anzworldline-solutions.com.au/
 *
 * ─── integratorId ────────────────────────────────────────────────────────────
 * The integratorId is provided by ANZ Worldline when you register as a POS
 * vendor. It is returned from the server in the device config response
 * (GET /api/v1/devices/config) so it is never hardcoded in the app.
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
  /** ANZ terminal config from server */
  config: { terminalIp: string; terminalPort?: number; integratorId?: string };
  /** Reference ID to include in the transaction (e.g. order ID) */
  referenceId?: string;
  title?: string;
  onApproved: (result: AnzPaymentResult) => void;
  onDeclined: (result: AnzPaymentResult) => void;
  onCancelled: () => void;
  onError: (message: string) => void;
}

// Bridge HTML loaded from Android assets
// The file must be at apps/mobile/assets/timapi/timapi-bridge.html
const BRIDGE_URI = 'file:///android_asset/timapi/timapi-bridge.html';

type Phase = 'loading' | 'connecting' | 'waiting' | 'approved' | 'declined' | 'cancelled' | 'error';

interface BridgeMessage {
  type: 'sdk_ready' | 'status' | 'approved' | 'declined' | 'error';
  message?: string;
  // approved fields
  transactionRef?: string;
  authCode?: string;
  maskedPan?: string;
  cardType?: string;
  rrn?: string;
  merchantReceipt?: string;
  customerReceipt?: string;
  // declined fields
  declineCode?: string;
  // error fields — message above
}

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
  const [phase, setPhase] = useState<Phase>('loading');
  const [statusText, setStatusText] = useState('Loading terminal SDK…');
  const webviewRef = useRef<WebView>(null);
  // True once we have sent the purchase command to the bridge
  const sentRef = useRef(false);
  // True if operator cancelled
  const cancelledRef = useRef(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!visible) {
      sentRef.current    = false;
      cancelledRef.current = false;
      setPhase('loading');
      setStatusText('Loading terminal SDK…');
    }
  }, [visible]);

  function sendPurchase() {
    if (sentRef.current || !webviewRef.current) return;
    sentRef.current = true;

    const amountCents = Math.round(amount * 100);
    const msg = JSON.stringify({
      type:        'purchase',
      terminalIp:  config.terminalIp.trim(),
      terminalPort: config.terminalPort ?? 80,
      integratorId: config.integratorId ?? '',
      amountCents,
      referenceId:  referenceId ?? `POS-${Date.now()}`,
    });
    webviewRef.current.postMessage(msg);
  }

  function handleBridgeMessage(raw: string) {
    let msg: BridgeMessage;
    try { msg = JSON.parse(raw) as BridgeMessage; }
    catch { return; }

    switch (msg.type) {
      case 'sdk_ready':
        setPhase('connecting');
        setStatusText('Connecting to terminal…');
        sendPurchase();
        break;

      case 'status':
        if (msg.message) {
          const m = msg.message.toLowerCase();
          if (m.includes('connect')) setPhase('connecting');
          else setPhase('waiting');
          setStatusText(msg.message);
        }
        break;

      case 'approved':
        if (cancelledRef.current) return;
        setPhase('approved');
        setStatusText('Payment approved!');
        setTimeout(() => {
          onApproved({
            approved:       true,
            transactionRef: msg.transactionRef,
            authCode:       msg.authCode,
            cardLast4:      msg.maskedPan?.slice(-4),
            cardType:       msg.cardType,
            rrn:            msg.rrn,
            merchantReceipt: msg.merchantReceipt ?? undefined,
            customerReceipt: msg.customerReceipt ?? undefined,
          });
        }, 800);
        break;

      case 'declined':
        if (cancelledRef.current) return;
        setPhase('declined');
        setStatusText(msg.message ?? 'Payment declined');
        setTimeout(() => {
          onDeclined({
            approved:      false,
            declineCode:   msg.declineCode,
            declineReason: msg.message,
          });
        }, 1500);
        break;

      case 'error': {
        if (cancelledRef.current) return;
        const errMsg = msg.message ?? 'Terminal error';
        setPhase('error');
        setStatusText(errMsg);
        setTimeout(() => onError(errMsg), 2000);
        break;
      }
    }
  }

  function handleCancel() {
    cancelledRef.current = true;
    // Tell the bridge to cancel the in-flight transaction
    webviewRef.current?.postMessage(JSON.stringify({ type: 'cancel' }));
    setPhase('cancelled');
    setStatusText('Transaction cancelled.');
    setTimeout(() => onCancelled(), 600);
  }

  const isTerminal  = phase === 'approved' || phase === 'declined' || phase === 'cancelled' || phase === 'error';
  const isProcessing = phase === 'loading'  || phase === 'connecting' || phase === 'waiting';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      {/* Hidden WebView — runs the TIM API bridge */}
      {visible && (
        <WebView
          ref={webviewRef}
          source={{ uri: BRIDGE_URI }}
          style={styles.hidden}
          javaScriptEnabled
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          originWhitelist={['*']}
          mixedContentMode="always"
          onMessage={(e) => handleBridgeMessage(e.nativeEvent.data)}
          onError={(e) => {
            setPhase('error');
            setStatusText('Failed to load terminal bridge: ' + e.nativeEvent.description);
            setTimeout(() => onError(e.nativeEvent.description), 2000);
          }}
        />
      )}

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
                {phase === 'loading' || phase === 'connecting' ? (
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
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
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
