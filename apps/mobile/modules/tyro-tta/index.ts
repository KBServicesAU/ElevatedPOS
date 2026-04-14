import { requireNativeModule, EventEmitter, Platform, type Subscription } from 'expo-modules-core';

/* ------------------------------------------------------------------ */
/* Environment                                                         */
/* ------------------------------------------------------------------ */

export type TyroEnvironment = 'simulator' | 'test' | 'production';

/* ------------------------------------------------------------------ */
/* Transaction results                                                 */
/* ------------------------------------------------------------------ */

/**
 * Raw transactionCompleteCallback payload from the Tyro IClientWithUI SDK.
 * All fields are strings per the Tyro docs. Numeric amounts are in
 * CENTS as strings. Only {@link TyroTransactionResult.result} is
 * guaranteed to be present — the rest are best-effort.
 */
export interface TyroTransactionResult {
  /** APPROVED, DECLINED, CANCELLED, REVERSED, SYSTEM ERROR, NOT STARTED, UNKNOWN */
  result: 'APPROVED' | 'DECLINED' | 'CANCELLED' | 'REVERSED' | 'SYSTEM ERROR' | 'NOT STARTED' | 'UNKNOWN' | string;

  transactionReference?: string;
  authorisationCode?: string;
  issuerActionCode?: string;
  cardType?: string;
  elidedPan?: string;
  rrn?: string;

  baseAmount?: string;
  transactionAmount?: string;
  surchargeAmount?: string;
  tipAmount?: string;
  cashoutAmount?: string;

  tipCompletionReference?: string;
  tabCompletionReference?: string;
  preAuthCompletionReference?: string;

  cardToken?: string;
  cardTokenExpiryDate?: string;
  cardTokenStatusCode?: string;
  cardTokenErrorMessage?: string;

  /** Integrated customer receipt text (monospaced font expected). */
  customerReceipt?: string;

  /** Error message for SYSTEM ERROR results (bridge field). */
  errorMessage?: string;

  [key: string]: string | undefined;
}

/* ------------------------------------------------------------------ */
/* Event payloads                                                      */
/* ------------------------------------------------------------------ */

/** Merchant receipt provided when integratedReceipt=true. */
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
  /** Create the IClientWithUI instance. Wait for onReady before transactions. */
  init(apiKey: string, vendor: string, productName: string, version: string, siteReference: string, environment: string): void;
  isInitialized(): boolean;

  /** Headless pairing — mandatory on Android 12+ before transactions. */
  pair(mid: string, tid: string): void;

  /** Purchase — shows Tyro's WebView UI automatically. */
  purchase(amountCents: string, cashoutCents: string, integratedReceipt: boolean, enableSurcharge: boolean, transactionId: string): void;
  /** Refund — shows Tyro's WebView UI automatically. */
  refund(amountCents: string, integratedReceipt: boolean, transactionId: string): void;

  /** Emergency cancel (Tyro's UI has its own cancel button in headful mode). */
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
 * Initialise the Tyro IClientWithUI SDK.
 * Wait for the `onReady` event before issuing transactions.
 *
 * @param siteReference  Optional site reference from Tyro portal.
 */
export function initTyro(
  apiKey: string,
  environment: TyroEnvironment = 'simulator',
  posProductVersion = '1.0.0',
  siteReference = '',
): void {
  TyroTTANativeModule.init(
    apiKey,
    'ElevatedPOS',
    'ElevatedPOS Mobile POS',
    posProductVersion,
    siteReference,
    environment,
  );
}

export function isTyroInitialized(): boolean {
  return TyroTTANativeModule.isInitialized();
}

/** Start the headless pairing flow. Result is streamed via onPairingStatus events. */
export function pairTyro(mid: string, tid: string): void {
  TyroTTANativeModule.pair(mid, tid);
}

/**
 * Initiate a purchase.
 * Tyro's WebView overlay appears automatically — no modal needed.
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
 * Tyro's WebView overlay appears automatically — no modal needed.
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

/**
 * Emergency cancel. In headful mode Tyro's iframe has its own cancel
 * button — only call this if the WebView appears stuck.
 */
export function tyroCancelTransaction(): void {
  TyroTTANativeModule.cancelTransaction();
}

export function tyroOpenTab(amountCents: string, integratedReceipt = true): void {
  TyroTTANativeModule.openTab(amountCents, integratedReceipt);
}

export function tyroCloseTab(completionReference: string, amountCents: string): void {
  TyroTTANativeModule.closeTab(completionReference, amountCents);
}

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

export function tyroAddTip(completionReference: string, tipCents: string): void {
  TyroTTANativeModule.addTip(completionReference, tipCents);
}

export function tyroManualSettlement(): void {
  TyroTTANativeModule.manualSettlement();
}

export function tyroReconciliationReport(reportType: 'txt' | 'xml' = 'txt', date = ''): void {
  TyroTTANativeModule.reconciliationReport(reportType, date);
}

export function tyroGetConfiguration(): void {
  TyroTTANativeModule.getConfiguration();
}

/* ------------------------------------------------------------------ */
/* Transaction outcome type (shared with components)                   */
/* ------------------------------------------------------------------ */

export interface TyroTransactionOutcome {
  result: TyroTransactionResult;
  /** Merchant receipt text from receiptCallback (when integratedReceipt=true). */
  merchantReceipt?: string;
  /** Whether the terminal requested a merchant-copy signature. */
  signatureRequired?: boolean;
}

/* ------------------------------------------------------------------ */
/* Transaction runner helper                                           */
/* ------------------------------------------------------------------ */

/**
 * Run a Tyro transaction and resolve when complete.
 *
 * In headful mode, Tyro's WebView overlay handles all in-flight UI.
 * This helper wires up the onReceipt and onTransactionComplete listeners
 * and resolves with the outcome once the SDK reports the final result.
 *
 * The returned promise never rejects — errors surface as
 * `{ result: 'SYSTEM ERROR', errorMessage }`.
 */
export function runTyroTransaction(
  start: () => void,
): Promise<TyroTransactionOutcome> {
  return new Promise<TyroTransactionOutcome>((resolve) => {
    let capturedReceipt: TyroReceiptEvent | undefined;
    const subs: Subscription[] = [];
    const cleanup = () => subs.forEach((s) => s.remove());

    subs.push(
      addTyroListener('onReceipt', (e) => {
        capturedReceipt = e;
      }),
      addTyroListener('onTransactionComplete', (e) => {
        cleanup();
        resolve({
          result: e.response ?? { result: 'UNKNOWN' },
          merchantReceipt: capturedReceipt?.merchantReceipt,
          signatureRequired: capturedReceipt?.signatureRequired,
        });
      }),
    );

    try {
      start();
    } catch (err) {
      cleanup();
      resolve({
        result: {
          result: 'SYSTEM ERROR',
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
    }
  });
}
