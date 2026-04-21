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
import { useTillStore } from '../store/till';

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

/**
 * Terminal capability bits, as reported by the TIM API Terminal after
 * activation. These are acquirer-level merchant config flags — e.g. ANZ
 * decides whether a merchant is allowed to surcharge, tip, cashback, etc.
 * null until the till is opened (we don't know the answer yet).
 */
export interface AnzCapabilities {
  canSurcharge: boolean;
  canTip: boolean;
  canCashback: boolean;
  canReservation: boolean;
  canReceiptRequest: boolean;
}

export interface AnzBridgeApi {
  state: AnzBridgeState;
  /** Null until the till is opened. Read-only — set by the terminal, not the POS. */
  capabilities: AnzCapabilities | null;
  openTill: () => Promise<void>;
  closeTill: () => Promise<void>;
  transaction: (amountCents: number, referenceId?: string) => Promise<AnzTransactionResult>;
  cancel: () => void;
  onStatus: (cb: (message: string) => void) => () => void;
  /**
   * Force a reset: best-effort close the terminal, clear ALL pending
   * promises, reset bridge state to 'idle'. Used when the terminal or
   * a lifecycle step gets stuck (e.g. hanging on Activate) and the
   * operator needs to start fresh. Does NOT touch the till store —
   * caller owns that.
   */
  forceReset: () => Promise<void>;
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
  | { type: 'till_opened'; requestId?: string; capabilities?: Partial<AnzCapabilities> & Record<string, unknown> }
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
  /** Late-bound auto-reopen helper — set once openTill is defined below. */
  const maybeAutoReopenTillRef = useRef<(() => Promise<void>) | null>(null);

  const [state, setState] = useState<AnzBridgeState>('idle');
  const [capabilities, setCapabilities] = useState<AnzCapabilities | null>(null);

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
        // Auto-restore: if persisted till state says we are in the middle
        // of a shift but the WebView has just been reloaded (app restart,
        // layout remount), silently re-run open_till so the terminal is
        // re-activated. Without this, the first transaction after a
        // remount fails with "Till is not open" even though the till
        // store says isOpen=true.
        void maybeAutoReopenTillRef.current?.();
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
        // v2.7.23 — capture the capability bits reported by the terminal
        // after activateCompleted. The bridge HTML always sends this
        // object now, but older cached bundles might not; fall back to
        // all-false so the UI still renders sensibly.
        if (msg.capabilities && typeof msg.capabilities === 'object') {
          const c = msg.capabilities;
          setCapabilities({
            canSurcharge:      !!c.canSurcharge,
            canTip:            !!c.canTip,
            canCashback:       !!c.canCashback,
            canReservation:    !!c.canReservation,
            canReceiptRequest: !!c.canReceiptRequest,
          });
        } else {
          setCapabilities({
            canSurcharge: false,
            canTip: false,
            canCashback: false,
            canReservation: false,
            canReceiptRequest: false,
          });
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
        setCapabilities(null);
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

  /**
   * Deduped openTill — if a call is already in flight, callers wait on
   * the existing promise instead of queuing a second open_till command
   * in the bridge. Without this, a manual tap on "Open Till" racing
   * against the sdk_ready auto-heal would fire open_till twice and the
   * terminal would appear to loop on "Activating…".
   */
  const inflightOpenRef = useRef<Promise<void> | null>(null);
  const openTill = useCallback<AnzBridgeApi['openTill']>(() => {
    if (inflightOpenRef.current) return inflightOpenRef.current;

    const p = new Promise<void>((resolve, reject) => {
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
    inflightOpenRef.current = p;
    p.finally(() => { inflightOpenRef.current = null; });
    return p;
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
    async (amountCents, referenceId) => {
      // Self-heal: if the user is mid-shift (till store says open) but the
      // bridge has no live terminal (e.g. the WebView just reloaded), run
      // open_till first so the transaction doesn't fail with
      // "Till is not open". If the till is genuinely closed we just fire
      // the transaction and let the bridge reject it with a clear message.
      const storeOpen = useTillStore.getState().isOpen;
      if (storeOpen && state !== 'open' && state !== 'transacting') {
        try {
          await openTill();
        } catch (err) {
          throw err instanceof Error
            ? err
            : new Error('Could not re-open terminal: ' + String(err));
        }
      }

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
    [makeRequestId, sendRaw, state, openTill],
  );

  // Wire the auto-reopen that fires on sdk_ready above. We need access to
  // openTill + state, which are defined after the sdk_ready handler, so we
  // stash a reference and call it indirectly.
  useEffect(() => {
    maybeAutoReopenTillRef.current = async () => {
      const storeOpen = useTillStore.getState().isOpen;
      if (!storeOpen) return;
      try {
        await openTill();
      } catch {
        // If auto-reopen fails we deliberately do NOT flip the till store
        // back to closed — the operator can manually re-open or close the
        // till. We surface the failure as a status message so the UI can
        // show something if it's listening.
        for (const cb of statusListenersRef.current) {
          try { cb('Terminal reconnect failed. Please re-open the till.'); } catch { /* ignore */ }
        }
      }
    };
  }, [openTill]);

  const cancel = useCallback<AnzBridgeApi['cancel']>(() => {
    sendRaw(JSON.stringify({ type: 'cancel' }));
  }, [sendRaw]);

  const onStatus = useCallback<AnzBridgeApi['onStatus']>((cb) => {
    statusListenersRef.current.add(cb);
    return () => { statusListenersRef.current.delete(cb); };
  }, []);

  /**
   * Force-reset the bridge. Used by the operator when a lifecycle step
   * hangs (e.g. terminal stuck on Activate) or the previous shift left
   * the bridge in an unrecoverable state. Sends `force_reset` to the
   * WebView (disposes the terminal + clears internal state) AND
   * rejects every pending promise in the RN host so any UI spinners
   * unblock immediately. Best-effort; always resolves.
   */
  const forceReset = useCallback<AnzBridgeApi['forceReset']>(async () => {
    try { sendRaw(JSON.stringify({ type: 'force_reset' })); } catch { /* ignore */ }
    // Drop any in-flight promises so callers don't wait on a ghost.
    rejectAll('Bridge was force-reset by the operator.');
    inflightOpenRef.current = null;
    setCapabilities(null);
    setState('idle');
  }, [sendRaw, rejectAll]);

  // Best-effort cleanup if the provider unmounts (POS session ends).
  useEffect(() => {
    return () => {
      rejectAll('Bridge unmounted');
    };
  }, [rejectAll]);

  const api = useMemo<AnzBridgeApi>(() => ({
    state,
    capabilities,
    openTill,
    closeTill,
    transaction,
    cancel,
    onStatus,
    forceReset,
  }), [state, capabilities, openTill, closeTill, transaction, cancel, onStatus, forceReset]);

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
