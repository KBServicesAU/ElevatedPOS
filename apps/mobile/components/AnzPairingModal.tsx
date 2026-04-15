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

export interface AnzPairingModalProps {
  visible: boolean;
  config: { terminalIp: string; terminalPort?: number; integratorId?: string };
  onPaired: () => void;
  onError: (message: string) => void;
  onDismiss: () => void;
}

const BRIDGE_URI = 'file:///android_asset/timapi/timapi-bridge.html';

type Phase = 'loading' | 'connecting' | 'paired' | 'error';

interface BridgeMessage {
  type: 'sdk_ready' | 'status' | 'paired' | 'error';
  message?: string;
}

export function AnzPairingModal({
  visible,
  config,
  onPaired,
  onError,
  onDismiss,
}: AnzPairingModalProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [statusText, setStatusText] = useState('Loading terminal SDK…');
  const webviewRef = useRef<WebView>(null);
  const sentRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      sentRef.current = false;
      setPhase('loading');
      setStatusText('Loading terminal SDK…');
    }
  }, [visible]);

  function sendPair() {
    if (sentRef.current || !webviewRef.current) return;
    sentRef.current = true;

    const msg = JSON.stringify({
      type:         'pair',
      terminalIp:   config.terminalIp.trim(),
      terminalPort: config.terminalPort ?? 80,
      integratorId: config.integratorId ?? '',
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
        sendPair();
        break;

      case 'status':
        if (msg.message) setStatusText(msg.message);
        break;

      case 'paired':
        setPhase('paired');
        setStatusText('Terminal connected and ready!');
        setTimeout(() => onPaired(), 800);
        break;

      case 'error': {
        const errMsg = msg.message ?? 'Terminal connection failed';
        setPhase('error');
        setStatusText(errMsg);
        setTimeout(() => onError(errMsg), 1500);
        break;
      }
    }
  }

  const phaseColor = phase === 'paired' ? '#4ade80' : phase === 'error' ? '#f87171' : '#6366f1';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Title */}
          <View style={styles.header}>
            <Ionicons name="card-outline" size={22} color={phaseColor} />
            <Text style={styles.title}>Connect Terminal</Text>
          </View>

          {/* Status icon */}
          <View style={[styles.iconBox, { borderColor: phaseColor, backgroundColor: phaseColor + '18' }]}>
            {phase === 'loading' || phase === 'connecting' ? (
              <ActivityIndicator size="large" color={phaseColor} />
            ) : phase === 'paired' ? (
              <Ionicons name="checkmark-circle" size={48} color={phaseColor} />
            ) : (
              <Ionicons name="alert-circle" size={48} color={phaseColor} />
            )}
            <Text style={[styles.status, { color: phaseColor }]}>{statusText}</Text>
            <Text style={styles.terminalIp}>{config.terminalIp}:{config.terminalPort ?? 80}</Text>
          </View>

          {/* Steps */}
          <View style={styles.steps}>
            {['Connect', 'Login', 'Activate'].map((step, i) => {
              const stepDone =
                (i === 0 && (phase === 'paired' || (phase === 'connecting' && statusText.toLowerCase().includes('login') || statusText.toLowerCase().includes('activ')))) ||
                (i === 1 && (phase === 'paired' || statusText.toLowerCase().includes('activ'))) ||
                (i === 2 && phase === 'paired');
              const stepActive = !stepDone && phase === 'connecting';
              return (
                <React.Fragment key={step}>
                  <View style={styles.stepDot}>
                    <View style={[
                      styles.dot,
                      stepDone && styles.dotDone,
                      stepActive && i === 0 && styles.dotActive,
                    ]} />
                    <Text style={[styles.stepLabel, stepDone && styles.stepLabelDone]}>{step}</Text>
                  </View>
                  {i < 2 && <View style={[styles.stepLine, stepDone && styles.stepLineDone]} />}
                </React.Fragment>
              );
            })}
          </View>

          {/* Dismiss on error */}
          {phase === 'error' && (
            <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss}>
              <Text style={styles.dismissText}>Close</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Hidden WebView — loads timapi.js and runs the pair command */}
        <WebView
          ref={webviewRef}
          source={{ uri: BRIDGE_URI }}
          style={styles.webview}
          javaScriptEnabled
          onMessage={(e) => handleBridgeMessage(e.nativeEvent.data)}
          onError={() => {
            setPhase('error');
            setStatusText('Failed to load terminal SDK');
          }}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          originWhitelist={['*']}
          mixedContentMode="always"
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#0d0f1f',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1e2a40',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  iconBox: {
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  status: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  terminalIp: {
    fontSize: 11,
    color: '#475569',
    fontFamily: 'monospace',
  },
  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  stepDot: {
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#334155',
  },
  dotDone: {
    backgroundColor: '#6366f1',
  },
  dotActive: {
    backgroundColor: '#6366f1',
    transform: [{ scale: 1.3 }],
  },
  stepLabel: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '600',
  },
  stepLabelDone: {
    color: '#6366f1',
  },
  stepLine: {
    width: 40,
    height: 1,
    backgroundColor: '#334155',
    marginBottom: 16,
  },
  stepLineDone: {
    backgroundColor: '#6366f1',
  },
  dismissBtn: {
    backgroundColor: '#1e2a40',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dismissText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700',
  },
  webview: {
    width: 1,
    height: 1,
    opacity: 0,
    position: 'absolute',
  },
});
