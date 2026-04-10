import { requireNativeModule, EventEmitter, Platform, type Subscription } from 'expo-modules-core';

/* ------------------------------------------------------------------ */
/* Environment                                                         */
/* ------------------------------------------------------------------ */

export type TyroEnvironment = 'simulator' | 'test' | 'production';

/* ------------------------------------------------------------------ */
/* Transaction results                                                 */
/* ------------------------------------------------------------------ */

/**
 * Raw transactionCompleteCallback payload from the Tyro iClient SDK.
 * All fields are strings per the Tyro docs. Numeric amounts are in
 * CENTS as strings. Only {@link TyroTransactionResult.result} is
 * guaranteed to be present — the rest are best-effort.
 */
export interface TyroTransactionResult {
  /** APPROVED, DECLINED, CANCELLED, REVERSED, SYSTEM ERROR, NOT STARTED, UNKNOWN */
  result: 'APPROVED' | 'DECLINED' | 'CANCELLED' | 'REVERSED' | 'SYSTEM ERROR' | 'NOT STARTED' | 'UNKNOWN' | string;

  /** Tyro's reference for this transaction. Quote to Tyro support. */
  transactionReference?: string;
  /** Scheme (Visa / Mastercard / etc.) authorisation code. */
  authorisationCode?: string;
  /** Raw issuer action code. */
  issuerActionCode?: string;
  /** Card scheme: Visa, Mastercard, Amex, Alipay, etc. */
  cardType?: string;
  /** Elided PAN, e.g. "XXXXXXXXXXXX1111". */
  elidedPan?: string;
  /** Retrieval Reference Number — unique per merchant for 7 days. */
  rrn?: string;

  /** Purchase amount in cents. */
  baseAmount?: string;
  /** Transaction total in cents. */
  transactionAmount?: string;
  /** Surcharge amount in cents (if enableSurcharge was true). */
  surchargeAmount?: string;
  /** Tip amount in cents (from a tip completion). */
  tipAmount?: string;
  /** Cashout amount in cents. */
  cashoutAmount?: string;

  /** Tyro's reference for a tip completion. */
  tipCompletionReference?: string;
  /** Tyro's reference for a bar tab. */
  tabCompletionReference?: string;
  /** Tyro's reference for a pre-auth. */
  preAuthCompletionReference?: string;

  /** Card token (if requestCardToken was set). */
  cardToken?: string;
  cardTokenExpiryDate?: string;
  cardTokenStatusCode?: string;
  cardTokenErrorMessage?: string;

  /** Integrated customer receipt (text, monospaced font expected). */
  customerReceipt?: string;

  /** Error message for SYSTEM ERROR results (our own bridge field). */
  errorMessage?: string;

  [key: string]: string | undefined;
}

/* ------------------------------------------------------------------ */
/* Event payloads                                                      */
/* ------------------------------------------------------------------ */

export interface TyroStatusMessageEvent {
  tag: string;
  message: string;
}

export interface TyroQuestionEvent {
  tag: string;
  text: string;
  options: string[];
  isError: boolean;
}

export interface TyroReceiptEvent {
  tag: string;
  signatureRequired: boolean;
  merchantReceipt: string;
}

export interface TyroTransactionCompleteEvent {
  tag: string;
  response: TyroTransactionResult;
}

export interface TyroResponseEvent {
  tag: string;
  response: Record<string, unknown>;
}

export interface TyroPairingStatusEvent {
  /** 'success' | 'failure' | 'inProgress' */
  status: string;
  message?: string;
  integrationKey?: string;
}

export interface TyroInitErrorEvent {
  message: string;
}

export interface TyroLogEvent {
  message: string;
}

/* ------------------------------------------------------------------ */
/* Native module surface                                               */
/* ------------------------------------------------------------------ */

interface TyroTTANative {
  init(apiKey: string, vendor: string, productName: string, version: string, environment: string): void;
  isInitialized(): boolean;

  pair(mid: string, tid: string): void;

  purchase(amountCents: string, cashoutCents: string, integratedReceipt: boolean, enableSurcharge: boolean, transactionId: string): void;
  refund(amountCents: string, integratedReceipt: boolean, transactionId: string): void;

  submitAnswer(answer: string): void;
  cancelTransaction(): void;

  openTab(amountCents: string, integratedReceipt: boolean): void;
  closeTab(completionReference: string, amountCents: string): void;

  openPreAuth(amountCents: string, integratedReceipt: boolean): void;
  incrementPreAuth(completionReference: string, amountCents: string, integratedReceipt: boolean): void;
  completePreAuth(completionReference: string, amountCents: string, integratedReceipt: boolean): void;
  voidPreAuth(completionReference: string, integratedReceipt: boolean): void;

  addTip(completionReference: string, tipCents: string): void;
  manualSettlement(): void;
  reconciliationReport(reportType: string, date: string): void;
  getConfiguration(): void;

  addListener?(eventName: string): void;
  removeListeners?(count: number): void;
}

/* ------------------------------------------------------------------ */
/* No-op stub for non-Android platforms                                */
/* ------------------------------------------------------------------ */

const noop: TyroTTANative = {
  init: () => {},
  isInitialized: () => false,
  pair: () => {},
  purchase: () => {},
  refund: () => {},
  submitAnswer: () => {},
  cancelTransaction: () => {},
  openTab: () => {},
  closeTab: () => {},
  openPreAuth: () => {},
  incrementPreAuth: () => {},
  completePreAuth: () => {},
  voidPreAuth: () => {},
  addTip: () => {},
  manualSettlement: () => {},
  reconciliationReport: () => {},
  getConfiguration: () => {},
};

let TyroTTANativeModule: TyroTTANative;

if (Platform.OS === 'android') {
  try {
    TyroTTANativeModule = requireNativeModule<TyroTTANative>('TyroTTA');
  } catch {
    TyroTTANativeModule = noop;
  }
} else {
  TyroTTANativeModule = noop;
}

/* ------------------------------------------------------------------ */
/* Event emitter                                                       */
/* ------------------------------------------------------------------ */

const emitter = Platform.OS === 'android' ? (() => {
  try {
    return new EventEmitter(TyroTTANativeModule as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
})() : null;

type TyroEventMap = {
  onReady: { ok: boolean };
  onInitError: TyroInitErrorEvent;
  onStatusMessage: TyroStatusMessageEvent;
  onQuestion: TyroQuestionEvent;
  onReceipt: TyroReceiptEvent;
  onTransactionComplete: TyroTransactionCompleteEvent;
  onResponse: TyroResponseEvent;
  onPairingStatus: TyroPairingStatusEvent;
  onLog: TyroLogEvent;
};

export function addTyroListener<K extends keyof TyroEventMap>(
  event: K,
  listener: (payload: TyroEventMap[K]) => void,
): Subscription {
  if (!emitter) {
    return { remove: () => {} } as Subscription;
  }
  return emitter.addListener<TyroEventMap[K]>(event, listener);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Initialise the Tyro iClient SDK.
 * Wait for the `onReady` event before issuing transactions.
 */
export function initTyro(
  apiKey: string,
  environment: TyroEnvironment = 'simulator',
  posProductVersion = '1.0.0',
): void {
  TyroTTANativeModule.init(
    apiKey,
    'ElevatedPOS',
    'ElevatedPOS Mobile POS',
    posProductVersion,
    environment,
  );
}

export function isTyroInitialized(): boolean {
  return TyroTTANativeModule.isInitialized();
}

/** Start the custom pairing flow. Result is streamed via onPairingStatus events. */
export function pairTyro(mid: string, tid: string): void {
  TyroTTANativeModule.pair(mid, tid);
}

/**
 * Initiate a purchase.
 *
 * @param amountCents  Integer-string cents for the sale amount (NEVER a double).
 * @param opts         Optional extras.
 */
export function tyroPurchase(
  amountCents: string,
  opts: {
    cashoutCents?: string;
    integratedReceipt?: boolean;
    enableSurcharge?: boolean;
    transactionId?: string;
  } = {},
): void {
  TyroTTANativeModule.purchase(
    amountCents,
    opts.cashoutCents ?? '',
    opts.integratedReceipt ?? true,
    opts.enableSurcharge ?? false,
    opts.transactionId ?? '',
  );
}

/**
 * Initiate a refund.
 */
export function tyroRefund(
  amountCents: string,
  opts: {
    integratedReceipt?: boolean;
    transactionId?: string;
  } = {},
): void {
  TyroTTANativeModule.refund(
    amountCents,
    opts.integratedReceipt ?? true,
    opts.transactionId ?? '',
  );
}

/** Submit the merchant's answer to a pending question. */
export function tyroAnswerQuestion(answer: string): void {
  TyroTTANativeModule.submitAnswer(answer);
}

/** Cancel the currently running transaction. */
export function tyroCancelTransaction(): void {
  TyroTTANativeModule.cancelTransaction();
}

/** Open a bar tab. */
export function tyroOpenTab(amountCents: string, integratedReceipt = true): void {
  TyroTTANativeModule.openTab(amountCents, integratedReceipt);
}

/** Close a previously opened bar tab. */
export function tyroCloseTab(completionReference: string, amountCents: string): void {
  TyroTTANativeModule.closeTab(completionReference, amountCents);
}

/** Open pre-auth. */
export function tyroOpenPreAuth(amountCents: string, integratedReceipt = true): void {
  TyroTTANativeModule.openPreAuth(amountCents, integratedReceipt);
}

export function tyroIncrementPreAuth(
  completionReference: string,
  amountCents: string,
  integratedReceipt = true,
): void {
  TyroTTANativeModule.incrementPreAuth(completionReference, amountCents, integratedReceipt);
}

export function tyroCompletePreAuth(
  completionReference: string,
  amountCents: string,
  integratedReceipt = true,
): void {
  TyroTTANativeModule.completePreAuth(completionReference, amountCents, integratedReceipt);
}

export function tyroVoidPreAuth(completionReference: string, integratedReceipt = true): void {
  TyroTTANativeModule.voidPreAuth(completionReference, integratedReceipt);
}

/** Add a tip to a completed purchase. */
export function tyroAddTip(completionReference: string, tipCents: string): void {
  TyroTTANativeModule.addTip(completionReference, tipCents);
}

/** Trigger manual settlement (end-of-day close). */
export function tyroManualSettlement(): void {
  TyroTTANativeModule.manualSettlement();
}

/** Fetch an integrated reconciliation report. */
export function tyroReconciliationReport(reportType: 'txt' | 'xml' = 'txt', date = ''): void {
  TyroTTANativeModule.reconciliationReport(reportType, date);
}

/** Fetch the current pairing configuration (MID / TID / printer location). */
export function tyroGetConfiguration(): void {
  TyroTTANativeModule.getConfiguration();
}

/* ------------------------------------------------------------------ */
/* Transaction runner helper                                           */
/* ------------------------------------------------------------------ */

/**
 * Run a transaction and resolve on the `onTransactionComplete` event.
 * Intermediate status/question/receipt events are forwarded to the
 * supplied callbacks so the caller can drive a React Native modal.
 *
 * The returned promise never rejects — errors are surfaced as
 * `{ result: 'SYSTEM ERROR', errorMessage }`.
 */
export function runTyroTransaction(
  start: () => void,
  handlers?: {
    onStatusMessage?: (e: TyroStatusMessageEvent) => void;
    onQuestion?: (e: TyroQuestionEvent) => void;
    onReceipt?: (e: TyroReceiptEvent) => void;
  },
): Promise<TyroTransactionResult> {
  return new Promise<TyroTransactionResult>((resolve) => {
    const subs: Subscription[] = [];
    const cleanup = () => subs.forEach((s) => s.remove());

    subs.push(
      addTyroListener('onStatusMessage', (e) => handlers?.onStatusMessage?.(e)),
      addTyroListener('onQuestion', (e) => handlers?.onQuestion?.(e)),
      addTyroListener('onReceipt', (e) => handlers?.onReceipt?.(e)),
      addTyroListener('onTransactionComplete', (e) => {
        cleanup();
        resolve(e.response ?? { result: 'UNKNOWN' });
      }),
    );

    try {
      start();
    } catch (err) {
      cleanup();
      resolve({
        result: 'SYSTEM ERROR',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
