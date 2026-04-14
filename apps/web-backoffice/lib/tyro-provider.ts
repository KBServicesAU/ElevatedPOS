/**
 * Tyro IClientWithUI (Headful Browser) Payment Provider
 *
 * Dynamically loads the Tyro iClient JS SDK and provides typed wrappers
 * for purchase, refund, and pairing operations. In headful mode, Tyro
 * renders its own transaction modal iframe — the POS just calls the methods
 * and awaits the result. No status messages, question prompts, or cancel
 * buttons needed — Tyro's UI handles all of that.
 *
 * @see https://iclient.tyro.com
 */

/* ------------------------------------------------------------------ */
/* Type Declarations for Tyro IClientWithUI SDK                        */
/* ------------------------------------------------------------------ */

export interface TyroConfig {
  apiKey: string;
  merchantId: string;
  terminalId: string;
  testMode: boolean;
  tyroHandlesSurcharge: boolean;
}

export interface TyroTransactionResult {
  result: 'APPROVED' | 'DECLINED' | 'CANCELLED' | 'SYSTEM ERROR' | 'REVERSED' | 'NOT STARTED';
  transactionId?: string;
  baseAmount?: string;
  transactionAmount?: string;
  surchargeAmount?: string;
  tipAmount?: string;
  cashoutAmount?: string;
  cardType?: string;
  cardLast4?: string;
  authCode?: string;
  customerReceipt?: string;
  merchantReceipt?: string;
  signatureRequired?: boolean;
}

interface TyroIClientOptions {
  posProductVendor: string;
  posProductName: string;
  posProductVersion: string;
}

interface TyroPurchaseRequest {
  amount: string;        // cents as string per Tyro docs
  cashout?: string;      // cents as string
  integratedReceipt: boolean;
  enableSurcharge?: boolean;
  mid?: number;          // override paired merchant ID
  tid?: number;          // override paired terminal ID
  integrationKey?: string;
}

interface TyroRefundRequest {
  amount: string;        // cents as string per Tyro docs
  integratedReceipt: boolean;
  mid?: number;
  tid?: number;
}

/**
 * Shape of the TYRO.IClientWithUI / TYRO.IClient class from the SDK.
 *
 * In headful (IClientWithUI) mode Tyro renders its own modal iframe — no
 * setStatusMessageCallback / setQuestionCallback needed.
 * In headless (IClient) fallback mode, questionCallback must be supplied;
 * we auto-answer YES to keep transactions flowing.
 * Receipts arrive via receiptCallback inside the transaction callbacks object.
 */
/** Question payload from the headless IClient SDK. */
interface TyroQuestion {
  text: string;
  options: string[];
  isError?: boolean;
}

interface TyroIClientWithUI {
  initiatePurchase(
    request: TyroPurchaseRequest,
    callbacks: {
      transactionCompleteCallback: (result: TyroTransactionResult) => void;
      receiptCallback?: (tag: string, signatureRequired: boolean, merchantReceipt: string) => void;
      /** Required by IClient (headless) SDK; ignored by IClientWithUI (headful). */
      statusMessageCallback?: (message: string, updateLastMessage?: boolean) => void;
      /** Required by IClient (headless) SDK; ignored by IClientWithUI (headful).
       *  question is { text, options, isError } — answer must be one of question.options. */
      questionCallback?: (question: TyroQuestion | string, answer: (response: string) => void) => void;
    },
  ): void;

  initiateRefund(
    request: TyroRefundRequest,
    callbacks: {
      transactionCompleteCallback: (result: TyroTransactionResult) => void;
      receiptCallback?: (tag: string, signatureRequired: boolean, merchantReceipt: string) => void;
      /** Required by IClient (headless) SDK; ignored by IClientWithUI (headful). */
      statusMessageCallback?: (message: string, updateLastMessage?: boolean) => void;
      /** Required by IClient (headless) SDK; ignored by IClientWithUI (headful). */
      questionCallback?: (question: TyroQuestion | string, answer: (response: string) => void) => void;
    },
  ): void;

  pairTerminal(
    mid: string,
    tid: string,
    responseReceivedCallback: (response: { status: string; message?: string }) => void,
  ): void;

  getConfiguration(
    responseReceivedCallback: (response: { status: string; config?: unknown }) => void,
  ): void;

  /** Emergency cancel — Tyro's modal UI has its own cancel button in headful mode. */
  cancelCurrentTransaction(): void;
}

interface TyroGlobal {
  /** Headful mode — Tyro renders its own modal UI (production SDK). */
  IClientWithUI?: new (apiKey: string, options: TyroIClientOptions) => TyroIClientWithUI;
  /** Headless mode — POS supplies UI callbacks (test SDK fallback). */
  IClient?: new (apiKey: string, options: TyroIClientOptions) => TyroIClientWithUI;
}

declare global {
  interface Window {
    TYRO?: TyroGlobal;
  }
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const TYRO_SCRIPT_TEST = 'https://iclient.test.tyro.com/iclient-v1.js';
const TYRO_SCRIPT_PROD = 'https://iclient.tyro.com/iclient-v1.js';

const POS_PRODUCT = {
  posProductVendor: 'ElevatedPOS',
  posProductName: 'ElevatedPOS Web POS',
  posProductVersion: '1.0.0',
} satisfies TyroIClientOptions;

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

let scriptLoaded = false;
let scriptLoading: Promise<void> | null = null;
let clientInstance: TyroIClientWithUI | null = null;
let currentConfig: TyroConfig | null = null;

/* ------------------------------------------------------------------ */
/* Script Loading                                                      */
/* ------------------------------------------------------------------ */

/** Dynamically inject the Tyro iClient script tag if not already loaded */
export function loadTyroScript(testMode = true): Promise<void> {
  if (scriptLoaded && window.TYRO) return Promise.resolve();
  if (scriptLoading) return scriptLoading;

  scriptLoading = new Promise<void>((resolve, reject) => {
    const url = testMode ? TYRO_SCRIPT_TEST : TYRO_SCRIPT_PROD;
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      // Script tag exists, wait for TYRO global
      const check = setInterval(() => {
        if (window.TYRO) {
          clearInterval(check);
          scriptLoaded = true;
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); reject(new Error('Tyro SDK load timeout')); }, 10000);
      return;
    }

    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => {
      const check = setInterval(() => {
        if (window.TYRO) {
          clearInterval(check);
          scriptLoaded = true;
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); reject(new Error('Tyro SDK init timeout')); }, 10000);
    };
    script.onerror = () => reject(new Error(`Failed to load Tyro iClient script from ${url}`));
    document.head.appendChild(script);
  });

  return scriptLoading;
}

/* ------------------------------------------------------------------ */
/* Client Instance                                                     */
/* ------------------------------------------------------------------ */

/** Get or create the Tyro IClientWithUI (or IClient) singleton */
export function getTyroClient(config: TyroConfig): TyroIClientWithUI {
  if (clientInstance && currentConfig?.apiKey === config.apiKey) {
    return clientInstance;
  }
  if (!window.TYRO) {
    throw new Error('Tyro SDK not loaded. Call loadTyroScript() first.');
  }
  // Prefer IClientWithUI (headful — Tyro renders its own modal UI).
  // Fall back to IClient (headless) when the test SDK is in use.
  const Constructor = window.TYRO.IClientWithUI ?? window.TYRO.IClient;
  if (!Constructor) {
    throw new Error('Tyro SDK: neither IClientWithUI nor IClient found on window.TYRO');
  }
  clientInstance = new Constructor(config.apiKey, POS_PRODUCT);
  currentConfig = config;
  return clientInstance;
}

/* ------------------------------------------------------------------ */
/* Purchase                                                            */
/* ------------------------------------------------------------------ */

/**
 * Initiate a purchase via Tyro IClientWithUI.
 *
 * Tyro renders its own modal iframe — no status/question callbacks are
 * needed. The promise resolves with the final result once Tyro's UI
 * closes. Receipt data captured via receiptCallback is merged into the
 * resolved result.
 */
export function initiateTyroPurchase(
  config: TyroConfig,
  amountCents: number,
): Promise<TyroTransactionResult> {
  return new Promise((resolve, reject) => {
    try {
      const client = getTyroClient(config);
      let capturedMerchantReceipt: string | undefined;
      let capturedSignatureRequired: boolean | undefined;

      client.initiatePurchase(
        {
          amount: String(Math.round(amountCents)), // string in cents per Tyro docs
          integratedReceipt: true,
          enableSurcharge: config.tyroHandlesSurcharge,
          mid: config.merchantId ? parseInt(config.merchantId) : undefined,
          tid: config.terminalId ? parseInt(config.terminalId) : undefined,
        },
        {
          // IClient (headless fallback) requires statusMessageCallback or throws.
          // IClientWithUI (headful) ignores it — Tyro's modal shows status.
          statusMessageCallback: () => {},
          // IClient requires questionCallback; question arg is { text, options, isError }.
          // Answer with first valid option (covers "OK" errors and "YES/NO" prompts).
          // IClientWithUI ignores this — its modal handles questions natively.
          questionCallback: (question, answer) => {
            if (typeof answer === 'function') {
              const opts = question && typeof question === 'object'
                ? (question as TyroQuestion).options
                : undefined;
              answer(opts && opts.length > 0 ? opts[0] : 'YES');
            }
          },
          receiptCallback: (_tag, signatureRequired, merchantReceipt) => {
            capturedMerchantReceipt = merchantReceipt;
            capturedSignatureRequired = signatureRequired;
          },
          transactionCompleteCallback: (result: TyroTransactionResult) => {
            resolve({
              ...result,
              merchantReceipt: capturedMerchantReceipt ?? result.merchantReceipt,
              signatureRequired: capturedSignatureRequired ?? result.signatureRequired,
            });
          },
        },
      );
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/* ------------------------------------------------------------------ */
/* Refund                                                              */
/* ------------------------------------------------------------------ */

/**
 * Initiate a refund via Tyro IClientWithUI.
 * Tyro renders its own modal — await the returned promise for the result.
 */
export function initiateTyroRefund(
  config: TyroConfig,
  amountCents: number,
): Promise<TyroTransactionResult> {
  return new Promise((resolve, reject) => {
    try {
      const client = getTyroClient(config);
      let capturedMerchantReceipt: string | undefined;
      let capturedSignatureRequired: boolean | undefined;

      client.initiateRefund(
        {
          amount: String(Math.round(amountCents)),
          integratedReceipt: true,
          mid: config.merchantId ? parseInt(config.merchantId) : undefined,
          tid: config.terminalId ? parseInt(config.terminalId) : undefined,
        },
        {
          statusMessageCallback: () => {},
          questionCallback: (question, answer) => {
            if (typeof answer === 'function') {
              const opts = question && typeof question === 'object'
                ? (question as TyroQuestion).options
                : undefined;
              answer(opts && opts.length > 0 ? opts[0] : 'YES');
            }
          },
          receiptCallback: (_tag, signatureRequired, merchantReceipt) => {
            capturedMerchantReceipt = merchantReceipt;
            capturedSignatureRequired = signatureRequired;
          },
          transactionCompleteCallback: (result: TyroTransactionResult) => {
            resolve({
              ...result,
              merchantReceipt: capturedMerchantReceipt ?? result.merchantReceipt,
              signatureRequired: capturedSignatureRequired ?? result.signatureRequired,
            });
          },
        },
      );
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/* ------------------------------------------------------------------ */
/* Pairing                                                             */
/* ------------------------------------------------------------------ */

export function pairTyroTerminal(
  config: TyroConfig,
): Promise<{ status: string; message?: string }> {
  return new Promise((resolve, reject) => {
    try {
      const client = getTyroClient(config);
      client.pairTerminal(
        config.merchantId,
        config.terminalId,
        (response: { status: string; message?: string }) => resolve(response),
      );
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/* ------------------------------------------------------------------ */
/* Configuration Check                                                 */
/* ------------------------------------------------------------------ */

export function getTyroConfiguration(
  config: TyroConfig,
): Promise<{ status: string; config?: unknown }> {
  return new Promise((resolve, reject) => {
    try {
      const client = getTyroClient(config);
      client.getConfiguration((response) => resolve(response));
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/* ------------------------------------------------------------------ */
/* Cancel (emergency)                                                  */
/* ------------------------------------------------------------------ */

/**
 * Emergency cancel — in headful mode Tyro's modal has its own cancel
 * button. Only call this if the modal appears stuck.
 */
export function cancelTyroTransaction(): void {
  clientInstance?.cancelCurrentTransaction();
}

/* ------------------------------------------------------------------ */
/* Demo / Simulation                                                   */
/* ------------------------------------------------------------------ */

/** Simulate a Tyro purchase for demo/test when no terminal is configured */
export function simulateTyroPurchase(amountCents: number): Promise<TyroTransactionResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        result: 'APPROVED',
        transactionId: `TYRO-SIM-${Date.now()}`,
        baseAmount: (amountCents / 100).toFixed(2),
        transactionAmount: (amountCents / 100).toFixed(2),
        cardType: 'Visa',
        cardLast4: '4242',
        authCode: `SIM${Math.floor(100000 + Math.random() * 900000)}`,
        customerReceipt: `ElevatedPOS\nSimulated Tyro Receipt\nAmount: $${(amountCents / 100).toFixed(2)}\nApproved`,
        merchantReceipt: `ElevatedPOS\nMerchant Copy\nAmount: $${(amountCents / 100).toFixed(2)}\nApproved`,
        signatureRequired: false,
      });
    }, 2000); // Simulate 2-second processing
  });
}
