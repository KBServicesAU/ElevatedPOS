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
import {
  logTerminalTx,
  type TerminalTxOutcome,
  type TerminalTxType,
} from '../lib/terminal-tx-log';

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
  /**
   * Run a card-present purchase. `orderId` is plumbed through to the
   * audit log (`terminal_transactions.order_id`) so support staff can
   * cross-reference an ANZ row to the parent POS order.
   */
  transaction: (
    amountCents: number,
    referenceId?: string,
    orderId?: string,
  ) => Promise<AnzTransactionResult>;
  /**
   * Refund `amountCents` to whichever card is presented on the terminal.
   * Internally runs the TIM API credit (refund) primitive. Same response
   * shape as `transaction()` — including the merchant + customer receipts
   * to be re-printed alongside the POS refund slip.
   */
  refund: (
    amountCents: number,
    referenceId?: string,
    orderId?: string,
  ) => Promise<AnzTransactionResult>;
  /**
   * Reverse the most recent card transaction for the same amount. Used
   * to undo a card-present sale when the card is still in hand. Callers
   * should guard on same-shift + card-paid before invoking this.
   */
  reverse: (
    amountCents: number,
    originalTransactionRef?: string | null,
    orderId?: string,
  ) => Promise<AnzTransactionResult>;
  /**
   * Trigger an EOD reconciliation (bank settlement) on the terminal.
   * The ANZ Worldline SDK runs `reconciliationAsync()` which clears the
   * terminal's batch and returns a printable settlement receipt. If the
   * SDK doesn't expose the method (older builds) this resolves with
   * `{ reconciliationReceipt: null }` rather than throwing, so the
   * close-till flow can still complete.
   */
  reconcile: () => Promise<{ reconciliationReceipt: string | null }>;
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
  kind: 'open' | 'close' | 'transaction' | 'refund' | 'reversal' | 'reconcile';
  /**
   * v2.7.48 — context captured at request time so the audit log entry can
   * be filled in from the bridge response without the call site having to
   * re-supply amount/reference/etc.
   */
  startedAt: number;
  amountCents: number | null;
  referenceId: string | null;
  orderId: string | null;
}

type BridgeMessage =
  | { type: 'sdk_ready' }
  | { type: 'status'; message?: string }
  | { type: 'progress'; step?: string; elapsed?: number; timeout?: number }
  | { type: 'till_opened'; requestId?: string; capabilities?: Partial<AnzCapabilities> & Record<string, unknown> }
  | { type: 'till_closed'; requestId?: string }
  | { type: 'reconciliation_done'; requestId?: string; reconciliationReceipt?: string | null }
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
  | {
      type: 'error';
      requestId?: string;
      message?: string;
      /**
       * SDK error category from TimException — drives the user-facing
       * title ("Card Declined" vs "Not Supported" vs "Cancelled" vs
       * "Terminal Error"). See extractTimError() in timapi-bridge.html.
       */
      category?: string | null;
      code?: number | null;
      step?: string | null;
      timedOut?: boolean;
      disconnected?: boolean;
    };

/**
 * Rich error thrown by the bridge. Carries the TimException category
 * so callers (AnzPaymentModal, Open Till screen) can differentiate
 * declinedNotSupported from a genuine card decline and render
 * appropriate copy.
 */
export class AnzBridgeError extends Error {
  category: string | null;
  code: number | null;
  step: string | null;
  timedOut: boolean;
  disconnected: boolean;
  constructor(opts: {
    message: string;
    category?: string | null;
    code?: number | null;
    step?: string | null;
    timedOut?: boolean;
    disconnected?: boolean;
  }) {
    super(opts.message);
    this.name = 'AnzBridgeError';
    this.category = opts.category ?? null;
    this.code = opts.code ?? null;
    this.step = opts.step ?? null;
    this.timedOut = !!opts.timedOut;
    this.disconnected = !!opts.disconnected;
  }
  get isDeclined(): boolean {
    return this.category === 'declined';
  }
  get isNotSupported(): boolean {
    return this.category === 'declinedNotSupported';
  }
  get isAborted(): boolean {
    return this.category === 'aborted' || /cancel/i.test(this.message);
  }
}

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
  /**
   * v2.7.48 — keep a ref of the last-known capabilities so the audit
   * logger can snapshot them on every transaction without React having
   * to re-read state through the closure.
   */
  const capabilitiesRef = useRef<AnzCapabilities | null>(null);
  useEffect(() => { capabilitiesRef.current = capabilities; }, [capabilities]);

  const terminalIp   = useAnzStore((s) => s.config.terminalIp);
  const terminalPort = useAnzStore((s) => s.config.terminalPort);

  /**
   * v2.7.48 — map a PendingRequest.kind to the audit log
   * `transaction_type` enum. Open / close till are recorded as
   * 'logon' / 'logoff' so ANZ certification reviewers can see them
   * alongside purchases in a single log file.
   */
  const kindToTxType = useCallback((kind: PendingRequest['kind']): TerminalTxType => {
    switch (kind) {
      case 'open':        return 'logon';
      case 'close':       return 'logoff';
      case 'transaction': return 'purchase';
      case 'refund':      return 'refund';
      case 'reversal':    return 'reversal';
      case 'reconcile':   return 'reconcile';
    }
  }, []);

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

      case 'progress': {
        // v2.7.31 — per-step elapsed time during openTill so the UI can
        // show "Logging in… (12s / 30s)" instead of a frozen spinner.
        const step = msg.step ?? 'Working';
        const elapsed = Math.max(0, Number(msg.elapsed) || 0);
        const timeout = Math.max(1, Number(msg.timeout) || 30);
        const text = `${step}… (${elapsed}s / ${timeout}s)`;
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
            // v2.7.48 — log the successful logon for ANZ cert evidence.
            try {
              logTerminalTx({
                outcome: 'approved',
                transactionType: 'logon',
                amountCents: null,
                referenceId: pending.referenceId,
                orderId: pending.orderId,
                durationMs: Date.now() - pending.startedAt,
                timCapabilities: msg.capabilities ?? null,
                raw: msg,
              });
            } catch { /* never fail the user flow on a log post */ }
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
            try {
              logTerminalTx({
                outcome: 'approved',
                transactionType: 'logoff',
                amountCents: null,
                referenceId: pending.referenceId,
                orderId: pending.orderId,
                durationMs: Date.now() - pending.startedAt,
                timCapabilities: capabilitiesRef.current,
                raw: msg,
              });
            } catch { /* never fail the user flow on a log post */ }
            pending.resolve(undefined);
          }
        }
        setCapabilities(null);
        setState('idle');
        return;
      }

      case 'reconciliation_done': {
        const reqId = msg.requestId;
        if (reqId) {
          const pending = pendingRef.current.get(reqId);
          if (pending) {
            pendingRef.current.delete(reqId);
            try {
              logTerminalTx({
                outcome: 'approved',
                transactionType: 'reconcile',
                amountCents: null,
                referenceId: pending.referenceId,
                orderId: pending.orderId,
                durationMs: Date.now() - pending.startedAt,
                timCapabilities: capabilitiesRef.current,
                merchantReceipt: msg.reconciliationReceipt ?? null,
                raw: msg,
              });
            } catch { /* never fail the user flow on a log post */ }
            pending.resolve({ reconciliationReceipt: msg.reconciliationReceipt ?? null });
          }
        }
        // Reconciliation fires while the till is still open — we do NOT
        // transition state here. The terminal stays in 'open' so the caller
        // can still run closeTill() immediately after.
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
            try {
              logTerminalTx({
                outcome: 'approved',
                transactionType: kindToTxType(pending.kind),
                amountCents: pending.amountCents,
                referenceId: pending.referenceId,
                orderId: pending.orderId,
                transactionRef: result.transactionRef,
                authCode: result.authCode,
                rrn: result.rrn,
                maskedPan: result.maskedPan,
                cardType: result.cardType,
                merchantReceipt: result.merchantReceipt,
                customerReceipt: result.customerReceipt,
                durationMs: Date.now() - pending.startedAt,
                timCapabilities: capabilitiesRef.current,
                raw: msg,
              });
            } catch { /* never fail the user flow on a log post */ }
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
            const declineCode = typeof msg.declineCode === 'string'
              ? Number(msg.declineCode) || null
              : null;
            try {
              logTerminalTx({
                outcome: 'declined',
                transactionType: kindToTxType(pending.kind),
                amountCents: pending.amountCents,
                referenceId: pending.referenceId,
                orderId: pending.orderId,
                errorCategory: 'declined',
                errorCode: declineCode,
                errorMessage: msg.message ?? 'Declined',
                durationMs: Date.now() - pending.startedAt,
                timCapabilities: capabilitiesRef.current,
                raw: msg,
              });
            } catch { /* never fail the user flow on a log post */ }
            pending.reject(new AnzBridgeError({
              message: msg.message ?? 'Declined',
              category: 'declined',
              code: declineCode,
            }));
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
            // v2.7.48 — distinguish timeouts and aborts from generic
            // errors so the dashboard log can filter on outcome and
            // ANZ cert reviewers can see the full picture.
            const outcome: TerminalTxOutcome = msg.timedOut
              ? 'timeout'
              : msg.category === 'aborted' || /cancel/i.test(errMsg)
                ? 'cancelled'
                : 'error';
            try {
              logTerminalTx({
                outcome,
                transactionType: kindToTxType(pending.kind),
                amountCents: pending.amountCents,
                referenceId: pending.referenceId,
                orderId: pending.orderId,
                errorCategory: msg.category ?? null,
                errorCode: msg.code ?? null,
                errorMessage: errMsg,
                errorStep: msg.step ?? null,
                durationMs: Date.now() - pending.startedAt,
                timCapabilities: capabilitiesRef.current,
                raw: msg,
              });
            } catch { /* never fail the user flow on a log post */ }
            pending.reject(new AnzBridgeError({
              message: errMsg,
              category: msg.category ?? null,
              code: msg.code ?? null,
              step: msg.step ?? null,
              timedOut: msg.timedOut ?? false,
              disconnected: msg.disconnected ?? false,
            }));
            // Correct the state based on what the pending call was.
            setState((prev) => {
              if (pending.kind === 'open')        return 'idle';
              if (pending.kind === 'close')       return 'open';
              if (pending.kind === 'transaction') return 'open';
              if (pending.kind === 'refund')      return 'open';
              if (pending.kind === 'reversal')    return 'open';
              if (pending.kind === 'reconcile')   return prev;
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
      pendingRef.current.set(requestId, {
        resolve, reject, kind: 'open',
        startedAt: Date.now(),
        amountCents: null,
        referenceId: null,
        orderId: null,
      });
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
      pendingRef.current.set(requestId, {
        resolve, reject, kind: 'close',
        startedAt: Date.now(),
        amountCents: null,
        referenceId: null,
        orderId: null,
      });
      setState('closing');
      sendRaw(JSON.stringify({ type: 'close_till', requestId }));
    });
  }, [makeRequestId, sendRaw]);

  /**
   * Deduped reconcile — a second call while one is in flight waits on the
   * existing promise instead of issuing a second reconciliation command.
   * Mirrors the openTill pattern.
   */
  const inflightReconcileRef = useRef<Promise<{ reconciliationReceipt: string | null }> | null>(null);
  const reconcile = useCallback<AnzBridgeApi['reconcile']>(() => {
    if (inflightReconcileRef.current) return inflightReconcileRef.current;
    const p = new Promise<{ reconciliationReceipt: string | null }>((resolve, reject) => {
      const requestId = makeRequestId();
      pendingRef.current.set(requestId, {
        resolve, reject, kind: 'reconcile',
        startedAt: Date.now(),
        amountCents: null,
        referenceId: null,
        orderId: null,
      });
      sendRaw(JSON.stringify({ type: 'reconcile', requestId }));
    });
    inflightReconcileRef.current = p;
    p.finally(() => { inflightReconcileRef.current = null; });
    return p;
  }, [makeRequestId, sendRaw]);

  const transaction = useCallback<AnzBridgeApi['transaction']>(
    async (amountCents, referenceId, orderId) => {
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
        pendingRef.current.set(requestId, {
          resolve, reject, kind: 'transaction',
          startedAt: Date.now(),
          amountCents: Math.round(amountCents),
          referenceId: referenceId ?? null,
          orderId: orderId ?? null,
        });
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

  /**
   * Deduped refund — a second call while one is in flight waits on the
   * existing promise instead of firing a second refund command at the
   * terminal. Mirrors openTill/reconcile so an accidental double-tap on
   * the Refund button can't double-credit the cardholder.
   */
  const inflightRefundRef = useRef<Promise<AnzTransactionResult> | null>(null);
  const refund = useCallback<AnzBridgeApi['refund']>(
    async (amountCents, referenceId, orderId) => {
      if (inflightRefundRef.current) return inflightRefundRef.current;

      // Self-heal: same as transaction() — if we're mid-shift but the
      // bridge has no live terminal, re-open first so the refund doesn't
      // fail with "Till is not open".
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

      const p = new Promise<AnzTransactionResult>((resolve, reject) => {
        const requestId = makeRequestId();
        pendingRef.current.set(requestId, {
          resolve, reject, kind: 'refund',
          startedAt: Date.now(),
          amountCents: Math.round(amountCents),
          referenceId: referenceId ?? null,
          orderId: orderId ?? null,
        });
        setState('transacting');
        const payload: Record<string, unknown> = {
          type: 'refund',
          requestId,
          amountCents: Math.round(amountCents),
        };
        if (referenceId) payload['referenceId'] = referenceId;
        sendRaw(JSON.stringify(payload));
      });
      inflightRefundRef.current = p;
      p.finally(() => { inflightRefundRef.current = null; });
      return p;
    },
    [makeRequestId, sendRaw, state, openTill],
  );

  /**
   * Deduped reverse — same pattern as refund. Reverses the last card
   * transaction matching `amountCents` in the terminal's local batch.
   * Callers should guard on shift + card-paid before invoking.
   */
  const inflightReverseRef = useRef<Promise<AnzTransactionResult> | null>(null);
  const reverse = useCallback<AnzBridgeApi['reverse']>(
    async (amountCents, originalTransactionRef, orderId) => {
      if (inflightReverseRef.current) return inflightReverseRef.current;

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

      const p = new Promise<AnzTransactionResult>((resolve, reject) => {
        const requestId = makeRequestId();
        pendingRef.current.set(requestId, {
          resolve, reject, kind: 'reversal',
          startedAt: Date.now(),
          amountCents: Math.round(amountCents),
          referenceId: originalTransactionRef ?? null,
          orderId: orderId ?? null,
        });
        setState('transacting');
        const payload: Record<string, unknown> = {
          type: 'reversal',
          requestId,
          amountCents: Math.round(amountCents),
        };
        if (originalTransactionRef) payload['originalTransactionRef'] = originalTransactionRef;
        sendRaw(JSON.stringify(payload));
      });
      inflightReverseRef.current = p;
      p.finally(() => { inflightReverseRef.current = null; });
      return p;
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
    refund,
    reverse,
    reconcile,
    cancel,
    onStatus,
    forceReset,
  }), [state, capabilities, openTill, closeTill, transaction, refund, reverse, reconcile, cancel, onStatus, forceReset]);

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
