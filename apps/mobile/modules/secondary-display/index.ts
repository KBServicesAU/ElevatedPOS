import { requireNativeModule, Platform } from 'expo-modules-core';

interface SecondaryDisplayNative {
  isAvailable(): boolean;
  show(): void;
  hide(): void;
  showIdle(welcomeMessage: string): void;
  showTransaction(dataJson: string): void;
  showThankYou(message: string, total: string): void;
  /** v2.7.84 — Customer-display QR Pay screen.
   *  Expects a JSON payload with `{ url, amount, tip? }`. The native
   *  side renders a large QR + amount + "Scan to Pay" headline. */
  showQrPay(dataJson: string): void;
}

const noop: SecondaryDisplayNative = {
  isAvailable: () => false,
  show: () => {},
  hide: () => {},
  showIdle: () => {},
  showTransaction: () => {},
  showThankYou: () => {},
  showQrPay: () => {},
};

const SecondaryDisplay: SecondaryDisplayNative =
  Platform.OS === 'android'
    ? requireNativeModule<SecondaryDisplayNative>('SecondaryDisplay')
    : noop;

export default SecondaryDisplay;
