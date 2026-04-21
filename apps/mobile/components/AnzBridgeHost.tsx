import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAnzStore } from '../store/anz';
import { getServerAnzConfig } from '../store/device-settings';

/**
 * AnzBridgeHost
 * ================================================================
 * Mounts a single hidden WebView at the POS layout level that hosts
 * the TIM API SDK (`timapi-bridge.html`). The WebView stays alive
 * for the life of the POS session so the terminal can stay in a
 * connected/activated state across transactions.
 *
 * Usage:
 *   <AnzBridgeProvider>
 *     <PosStack />
 *   </AnzBridgeProvider>
 *
 *   const bridge = useAnzBridge();
 *   await bridge.openTill();
 *   const result = await bridge.transaction(1250, 'POS-123');
 *   await bridge.closeTill();
 */

export type AnzBridgeState = 'idle' | 'opening' | 'open' | 'closing' | 'transacting';

export interface AnzTransactionResult {
  transactionRef: string | null;
  authCode: string | null;
  maskedPan: string | null;
  cardType: string | null;
  rrn: string | null;
  merchantReceipt: string | null;
  customerReceipt: string | null;
}

export interface AnzBridgeApi {
  state: AnzBridgeState;
  openTill: () => Promise<void>;
  closeTill: () => Promise<void>;
  transaction: (amountCents: number, referenceId?: string) => Promise<AnzTransactionResult>;
  cancel: () => void;
  onStatus: (cb: (message: string) => void) => () => void;
}

const BRIDGE_URI = 'file:///android_asset/timapi/timapi-bridge.html';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  /** Kind of request — used to map response types back to the right promise. */
  kind: 'open' | 'close' | 'transaction';
}

type BridgeMessage =
  | { type: 'sdk_ready' }
  | { type: 'status'; message?: string }
  | { type: 'till_opened'; requestId?: string }
  | { type: 'till_closed'; requestId?: string }
  | {
      type: 'approved';
      requestId?: string;
      transactionRef?: string | null;
      authCode?: string | null;
      maskedPan?: string | null;
      cardType?: string | null;
      rrn?: string | null;
      merchantReceipt?: string | null;
      customerReceipt?: string | null;
    }
  | { type: 'declined'; requestId?: string; message?: string; declineCode?: string }
  | { type: 'error'; requestId?: string; message?: string };

const AnzBridgeContext = createContext<AnzBridgeApi | null>(null);

export function useAnzBridge(): AnzBridgeApi {
  const ctx = useContext(AnzBridgeContext);
  if (!ctx) {
    throw new Error('useAnzBridge must be used inside <AnzBridgeProvider>');
  }
  return ctx;
}

export function AnzBridgeProvider({ children }: { children: React.ReactNode }) {
  const webviewRef = useRef<WebView>(null);
  const sdkReadyRef = useRef(false);
  /** Commands queued while the SDK is still loading. */
  const outboxRef = useRef<string[]>([]);
  /** Pending promise map keyed by requestId. */
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map());
  /** Registered status listeners. */
  const statusListenersRef = useRef<Set<(m: string) => void>>(new Set());

  const [state, setState] = useState<AnzBridgeState>('idle');

  const terminalIp   = useAnzStore((s) => s.config.terminalIp);
  const terminalPort = useAnzStore((s) => s.config.terminalPort);

  const sendRaw = useCallback((payload: string) => {
    if (sdkReadyRef.current && webviewRef.current) {
      webviewRef.current.postMessage(payload);
    } else {
      outboxRef.current.push(payload);
    }
  }, []);

  const flushOutbox = useCallback(() => {
    if (!webviewRef.current) return;
    const q = outboxRef.current;
    outboxRef.current = [];
    for (const m of q) webviewRef.current.postMessage(m);
  }, []);

  const rejectAll = useCallback((message: string) => {
    for (const [, req] of pendingRef.current) {
      req.reject(new Error(message));
    }
    pendingRef.current.clear();
  }, []);

  const makeRequestId = useCallback(() => {
    return 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }, []);

  const handleBridgeMessage = useCallback((raw: string) => {
    let msg: BridgeMessage;
    try { msg = JSON.parse(raw) as BridgeMessage; } catch { return; }

    switch (msg.type) {
      case 'sdk_ready':
        sdkReadyRef.current = true;
        flushOutbox();
        return;

      case 'status': {
        const text = msg.message ?? '';
        if (!text) return;
        for (const cb of statusListenersRef.current) {
          try { cb(text); } catch { /* ignore listener errors */ }
        }
        return;
      }

      case 'till_opened': {
        const reqId = msg.requestId;
        if (reqId) {
          const pending = pendingRef.current.get(reqId);
          if (pending) {
            pendingRef.current.delete(reqId);
            pending.resolve(undefined);
          }
        }
        setState('open');
        return;
      }

      case 'till_closed': {
        const reqId = msg.requestId;
        if (reqId) {
          const pending = pendingRef.current.get(reqId);
          if (pending) {
            pendingRef.current.delete(reqId);
            pending.resolve(undefined);
          }
        }
        setState('idle');
        return;
      }

      case 'approved': {
        const reqId = msg.requestId;
        if (reqId) {
          const pending = pendingRef.current.get(reqId);
          if (pending) {
            pendingRef.current.delete(reqId);
            const result: AnzTransactionResult = {
              transactionRef:  msg.transactionRef  ?? null,
              authCode:        msg.authCode        ?? null,
              maskedPan:       msg.maskedPan       ?? null,
              cardType:        msg.cardType        ?? null,
              rrn:             msg.rrn             ?? null,
              merchantReceipt: msg.merchantReceipt ?? null,
              customerReceipt: msg.customerReceipt ?? null,
            };
            pending.resolve(result);
          }
        }
        // Any successful transaction means we're back in 'open' state.
        setState((prev) => (prev === 'transacting' ? 'open' : prev));
        return;
      }

      case 'declined': {
        const reqId = msg.requestId;
        if (reqId) {
          const pending = pendingRef.current.get(reqId);
          if (pending) {
            pendingRef.current.delete(reqId);
            pending.reject(new Error(msg.message ?? 'Declined'));
          }
        }
        setState((prev) => (prev === 'transacting' ? 'open' : prev));
        return;
      }

      case 'error': {
        const reqId = msg.requestId;
        const errMsg = msg.message ?? 'Terminal error';
        if (reqId) {
          const pending = pendingRef.current.get(reqId);
          if (pending) {
            pendingRef.current.delete(reqId);
            pending.reject(new Error(errMsg));
            // Correct the state based on what the pending call was.
            setState((prev) => {
              if (pending.kind === 'open')        return 'idle';
              if (pending.kind === 'close')       return 'open';
              if (pending.kind === 'transaction') return 'open';
              return prev;
            });
            return;
          }
        }
        // Unsolicited error (no requestId) — surface it as a status.
        for (const cb of statusListenersRef.current) {
          try { cb(errMsg); } catch { /* ignore listener errors */ }
        }
        return;
      }
    }
  }, [flushOutbox]);

  const openTill = useCallback<AnzBridgeApi['openTill']>(() => {
    return new Promise<void>((resolve, reject) => {
      // Prefer the server-pushed config (includes integratorId); fall back to local store.
      const serverCfg = getServerAnzConfig();
      const ip   = (serverCfg?.terminalIp ?? terminalIp).trim();
      const port = serverCfg?.terminalPort ?? terminalPort ?? 7784;
      const integratorId = serverCfg?.integratorId;

      if (!ip) {
        reject(new Error('Terminal IP is not configured. Set it in ANZ Settings first.'));
        return;
      }

      const requestId = makeRequestId();
      pendingRef.current.set(requestId, { resolve, reject, kind: 'open' });
      setState('opening');

      const payload: Record<string, unknown> = {
        type: 'open_till',
        requestId,
        terminalIp: ip,
        terminalPort: port,
      };
      if (integratorId && typeof integratorId === 'string' && integratorId.trim() !== '') {
        payload['integratorId'] = integratorId.trim();
      }
      sendRaw(JSON.stringify(payload));
    });
  }, [terminalIp, terminalPort, makeRequestId, sendRaw]);

  const closeTill = useCallback<AnzBridgeApi['closeTill']>(() => {
    return new Promise<void>((resolve, reject) => {
      const requestId = makeRequestId();
      pendingRef.current.set(requestId, { resolve, reject, kind: 'close' });
      setState('closing');
      sendRaw(JSON.stringify({ type: 'close_till', requestId }));
    });
  }, [makeRequestId, sendRaw]);

  const transaction = useCallback<AnzBridgeApi['transaction']>(
    (amountCents, referenceId) => {
      return new Promise<AnzTransactionResult>((resolve, reject) => {
        const requestId = makeRequestId();
        pendingRef.current.set(requestId, { resolve, reject, kind: 'transaction' });
        setState('transacting');
        const payload: Record<string, unknown> = {
          type: 'transaction',
          requestId,
          amountCents: Math.round(amountCents),
        };
        if (referenceId) payload['referenceId'] = referenceId;
        sendRaw(JSON.stringify(payload));
      });
    },
    [makeRequestId, sendRaw],
  );

  const cancel = useCallback<AnzBridgeApi['cancel']>(() => {
    sendRaw(JSON.stringify({ type: 'cancel' }));
  }, [sendRaw]);

  const onStatus = useCallback<AnzBridgeApi['onStatus']>((cb) => {
    statusListenersRef.current.add(cb);
    return () => { statusListenersRef.current.delete(cb); };
  }, []);

  // Best-effort cleanup if the provider unmounts (POS session ends).
  useEffect(() => {
    return () => {
      rejectAll('Bridge unmounted');
    };
  }, [rejectAll]);

  const api = useMemo<AnzBridgeApi>(() => ({
    state,
    openTill,
    closeTill,
    transaction,
    cancel,
    onStatus,
  }), [state, openTill, closeTill, transaction, cancel, onStatus]);

  return (
    <AnzBridgeContext.Provider value={api}>
      {children}
      <View pointerEvents="none" style={styles.hiddenHost}>
        <WebView
          ref={webviewRef}
          source={{ uri: BRIDGE_URI }}
          style={styles.hiddenWeb}
          javaScriptEnabled
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          originWhitelist={['*']}
          mixedContentMode="always"
          onMessage={(e) => handleBridgeMessage(e.nativeEvent.data)}
          onError={() => {
            sdkReadyRef.current = false;
            rejectAll('Failed to load ANZ terminal bridge');
          }}
        />
      </View>
    </AnzBridgeContext.Provider>
  );
}

const styles = StyleSheet.create({
  hiddenHost: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    top: -10,
    left: -10,
  },
  hiddenWeb: {
    width: 1,
    height: 1,
    opacity: 0,
    backgroundColor: 'transparent',
  },
});
