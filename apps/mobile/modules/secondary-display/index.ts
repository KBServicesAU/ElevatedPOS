import { requireNativeModule, Platform } from 'expo-modules-core';

interface SecondaryDisplayNative {
  isAvailable(): boolean;
  show(): void;
  hide(): void;
  showIdle(welcomeMessage: string): void;
  showTransaction(dataJson: string): void;
  showThankYou(message: string, total: string): void;
}

const noop: SecondaryDisplayNative = {
  isAvailable: () => false,
  show: () => {},
  hide: () => {},
  showIdle: () => {},
  showTransaction: () => {},
  showThankYou: () => {},
};

const SecondaryDisplay: SecondaryDisplayNative =
  Platform.OS === 'android'
    ? requireNativeModule<SecondaryDisplayNative>('SecondaryDisplay')
    : noop;

export default SecondaryDisplay;
