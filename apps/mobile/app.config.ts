import type { ConfigContext, ExpoConfig } from 'expo/config';

const ROLE_LOCK = process.env['EXPO_PUBLIC_ROLE_LOCK'] as 'pos' | 'kds' | 'kiosk' | 'dashboard' | undefined;

const roleConfig: Record<
  'pos' | 'kds' | 'kiosk' | 'dashboard',
  { name: string; slug: string; bundleIdentifier: string; package: string }
> = {
  pos: {
    name: 'ElevatedPOS',
    slug: 'elevatedpos',
    bundleIdentifier: 'com.au.elevatedpos.pos',
    package: 'com.au.elevatedpos.pos',
  },
  kds: {
    name: 'ElevatedPOS KDS',
    slug: 'elevatedpos',
    bundleIdentifier: 'com.au.elevatedpos.kds',
    package: 'com.au.elevatedpos.kds',
  },
  kiosk: {
    name: 'ElevatedPOS Kiosk',
    slug: 'elevatedpos',
    bundleIdentifier: 'com.au.elevatedpos.kiosk',
    package: 'com.au.elevatedpos.kiosk',
  },
  dashboard: {
    name: 'ElevatedPOS Dashboard',
    slug: 'elevatedpos',
    bundleIdentifier: 'com.au.elevatedpos.dashboard',
    package: 'com.au.elevatedpos.dashboard',
  },
};

const resolved = ROLE_LOCK ? roleConfig[ROLE_LOCK] : null;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  owner: 'kbservicesau',
  name: resolved?.name ?? process.env['EXPO_PUBLIC_APP_NAME'] ?? 'ElevatedPOS',
  slug: resolved?.slug ?? 'elevatedpos',
  version: '1.8.4',
  scheme: 'elevatedpos',
  orientation: 'default',
  platforms: ['ios', 'android'],
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0a0a0a',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: resolved?.bundleIdentifier ?? process.env['APP_BUNDLE_ID_IOS'] ?? 'com.au.elevatedpos.mobile',
    requireFullScreen: true,
  },
  android: {
    permissions: [
      // USB thermal printer support
      'android.permission.USB_PERMISSION',
      // Network
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
      // Bluetooth printer support (classic + BLE)
      // Android ≤11 (API 30) legacy permissions
      'android.permission.BLUETOOTH',
      'android.permission.BLUETOOTH_ADMIN',
      // Android 12+ (API 31+) runtime permissions — required before BLEPrinter.init()
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.BLUETOOTH_SCAN',
      // Location required for BT device discovery on Android ≤11
      'android.permission.ACCESS_FINE_LOCATION',
    ],
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0a0a0a',
    },
    package: resolved?.package ?? process.env['APP_PACKAGE_ANDROID'] ?? 'com.au.elevatedpos.mobile',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    './plugins/withCleartextTraffic',
    './plugins/withUsbPrinter',
    [
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 34,
          targetSdkVersion: 34,
          buildToolsVersion: '34.0.0',
          kotlinVersion: '1.9.23',
        },
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0a0a0a',
        image: './assets/splash.png',
        resizeMode: 'contain',
      },
    ],
    'expo-screen-orientation',
  ],
  updates: {
    enabled: true,
    url: 'https://u.expo.dev/5f03d9c6-0120-4047-aa27-f71a823afa7b',
    fallbackToCacheTimeout: 5000,
    checkAutomatically: 'ON_LOAD',
  },
  runtimeVersion: {
    policy: 'sdkVersion',
  },
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: process.env['EAS_PROJECT_ID'] ?? '5f03d9c6-0120-4047-aa27-f71a823afa7b' },
    roleLock: ROLE_LOCK ?? null,
  },
});
