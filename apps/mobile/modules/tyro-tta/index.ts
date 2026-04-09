import { requireNativeModule, Platform } from 'expo-modules-core';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface TyroTTAResult {
  result: string; // 'APPROVED', 'DECLINED', 'CANCELLED', 'SYSTEM ERROR'
  transactionReference?: string;
  authorisationCode?: string;
  cardType?: string;
  baseAmount?: string;
  surchargeAmount?: string;
  tipAmount?: string;
  cashoutAmount?: string;
  [key: string]: string | undefined;
}

type TyroEnvironment = 'simulator' | 'test' | 'production';

/* ------------------------------------------------------------------ */
/* Native Module                                                       */
/* ------------------------------------------------------------------ */

interface TyroTTANative {
  init(apiKey: string, vendor: string, productName: string, version: string, environment: string): void;
  pairTerminal(): void;
  closePairing(): void;
  purchase(amountCents: string, integratedReceipt: boolean): Promise<string>;
  refund(amountCents: string, integratedReceipt: boolean): Promise<string>;
  isInitialized(): boolean;
}

const noop: TyroTTANative = {
  init: () => {},
  pairTerminal: () => {},
  closePairing: () => {},
  purchase: async () => JSON.stringify({ result: 'SYSTEM ERROR', message: 'Not available on this platform' }),
  refund: async () => JSON.stringify({ result: 'SYSTEM ERROR', message: 'Not available on this platform' }),
  isInitialized: () => false,
};

const TyroTTANativeModule: TyroTTANative =
  Platform.OS === 'android'
    ? requireNativeModule<TyroTTANative>('TyroTTA')
    : noop;

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Initialize the Tyro TTA client.
 * Must be called once before any transactions.
 */
export function initTyro(
  apiKey: string,
  environment: TyroEnvironment = 'simulator',
): void {
  TyroTTANativeModule.init(
    apiKey,
    'ElevatedPOS',
    'ElevatedPOS Mobile POS',
    '1.0.0',
    environment,
  );
}

/**
 * Open the Tyro terminal pairing configuration page.
 * Shows a full-screen dialog with Tyro's pairing WebView
 * where the user enters Merchant ID and Terminal ID.
 */
export function pairTyroTerminal(): void {
  TyroTTANativeModule.pairTerminal();
}

/**
 * Close the pairing dialog.
 */
export function closeTyroPairing(): void {
  TyroTTANativeModule.closePairing();
}

/**
 * Initiate a purchase transaction.
 * @param amountCents Amount in cents as a string (e.g. "1500" for $15.00)
 * @param integratedReceipt true = POS prints receipt, false = terminal prints
 * @returns Transaction result
 */
export async function tyroPurchase(
  amountCents: string,
  integratedReceipt = true,
): Promise<TyroTTAResult> {
  const json = await TyroTTANativeModule.purchase(amountCents, integratedReceipt);
  return JSON.parse(json) as TyroTTAResult;
}

/**
 * Initiate a refund transaction.
 * @param amountCents Amount in cents as a string
 * @param integratedReceipt true = POS prints receipt, false = terminal prints
 * @returns Transaction result
 */
export async function tyroRefund(
  amountCents: string,
  integratedReceipt = true,
): Promise<TyroTTAResult> {
  const json = await TyroTTANativeModule.refund(amountCents, integratedReceipt);
  return JSON.parse(json) as TyroTTAResult;
}

/**
 * Check if the Tyro TTA client is initialized.
 */
export function isTyroInitialized(): boolean {
  return TyroTTANativeModule.isInitialized();
}
