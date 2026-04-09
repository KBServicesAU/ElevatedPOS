/**
 * Tyro iClient (Headful Browser) Payment Provider
 *
 * Dynamically loads the Tyro iClient JS SDK and provides typed wrappers
 * for purchase, refund, and pairing operations. In headful mode, Tyro
 * renders its own transaction UI modal — the POS just calls the methods
 * and handles callbacks.
 *
 * @see https://iclient.tyro.com
 */

/* ------------------------------------------------------------------ */
/* Type Declarations for Tyro iClient SDK                              */
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

/** Shape of the TYRO.IClient class from the SDK */
interface TyroIClient {
  initiatePurchase(
    request: TyroPurchaseRequest,
    transactionCallbacks: { transactionCompleteCallback: (result: TyroTransactionResult) => void },
  ): void;

  initiateRefund(
    request: TyroRefundRequest,
    transactionCallbacks: { transactionCompleteCallback: (result: TyroTransactionResult) => void },
  ): void;

  pairTerminal(
    mid: string,
    tid: string,
    responseReceivedCallback: (response: { status: string; message?: string }) => void,
  ): void;

  getConfiguration(
    responseReceivedCallback: (response: { status: string; config?: unknown }) => void,
  ): void;

  cancelCurrentTransaction(): void;

  setStatusMessageCallback(callback: (message: string) => void): void;
  setReceiptCallback(callback: (merchantReceipt: string, customerReceipt: string, signatureRequired: boolean) => void): void;
  setQuestionCallback(callback: (question: string, answerCallback: (answer: string) => void) => void): void;
}

interface TyroGlobal {
  IClient: new (apiKey: string, options: TyroIClientOptions) => TyroIClient;
}

declare global {
  interface Window {
    TYRO?: TyroGlobal;
  }
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const TYRO_SCRIPT_TEST = 'https://iclient-test.tyro.com/iclient-v1.js';
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
let clientInstance: TyroIClient | null = null;
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

/** Get or create the Tyro iClient singleton */
export function getTyroClient(config: TyroConfig): TyroIClient {
  if (clientInstance && currentConfig?.apiKey === config.apiKey) {
    return clientInstance;
  }
  if (!window.TYRO) {
    throw new Error('Tyro SDK not loaded. Call loadTyroScript() first.');
  }
  clientInstance = new window.TYRO.IClient(config.apiKey, POS_PRODUCT);
  currentConfig = config;
  return clientInstance;
}

/* ------------------------------------------------------------------ */
/* Purchase                                                            */
/* ------------------------------------------------------------------ */

export function initiateTyroPurchase(
  config: TyroConfig,
  amountCents: number,
  callbacks?: {
    onStatusMessage?: (message: string) => void;
    onReceipt?: (merchant: string, customer: string, signatureRequired: boolean) => void;
    onQuestion?: (question: string, answer: (response: string) => void) => void;
  },
): Promise<TyroTransactionResult> {
  return new Promise((resolve, reject) => {
    try {
      const client = getTyroClient(config);

      // Register optional callbacks
      if (callbacks?.onStatusMessage) {
        client.setStatusMessageCallback(callbacks.onStatusMessage);
      }
      if (callbacks?.onReceipt) {
        client.setReceiptCallback(callbacks.onReceipt);
      }
      if (callbacks?.onQuestion) {
        client.setQuestionCallback(callbacks.onQuestion);
      }

      client.initiatePurchase(
        {
          amount: String(Math.round(amountCents)), // string in cents per Tyro docs
          integratedReceipt: true,
          mid: config.merchantId ? parseInt(config.merchantId) : undefined,
          tid: config.terminalId ? parseInt(config.terminalId) : undefined,
        },
        {
          transactionCompleteCallback: (result: TyroTransactionResult) => {
            resolve(result);
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

export function initiateTyroRefund(
  config: TyroConfig,
  amountCents: number,
  callbacks?: {
    onStatusMessage?: (message: string) => void;
    onReceipt?: (merchant: string, customer: string, signatureRequired: boolean) => void;
  },
): Promise<TyroTransactionResult> {
  return new Promise((resolve, reject) => {
    try {
      const client = getTyroClient(config);

      if (callbacks?.onStatusMessage) {
        client.setStatusMessageCallback(callbacks.onStatusMessage);
      }
      if (callbacks?.onReceipt) {
        client.setReceiptCallback(callbacks.onReceipt);
      }

      client.initiateRefund(
        {
          amount: String(Math.round(amountCents)),
          integratedReceipt: true,
          mid: config.merchantId ? parseInt(config.merchantId) : undefined,
          tid: config.terminalId ? parseInt(config.terminalId) : undefined,
        },
        {
          transactionCompleteCallback: (result: TyroTransactionResult) => {
            resolve(result);
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
/* Cancel                                                              */
/* ------------------------------------------------------------------ */

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
