import type { ConfigContext, ExpoConfig } from 'expo/config';

const ROLE_LOCK = process.env['EXPO_PUBLIC_ROLE_LOCK'] as 'pos' | 'kds' | 'kiosk' | 'dashboard' | 'display' | undefined;

const roleConfig: Record<
  'pos' | 'kds' | 'kiosk' | 'dashboard' | 'display',
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
  display: {
    name: 'ElevatedPOS Display',
    slug: 'elevatedpos',
    bundleIdentifier: 'com.au.elevatedpos.display',
    package: 'com.au.elevatedpos.display',
  },
};

const resolved = ROLE_LOCK ? roleConfig[ROLE_LOCK] : null;

export default ({ config }: ConfigContext): ExpoConfig => {
  // The Stripe React Native SDK's native StripeInitializer (Jetpack Initializer /
  // ContentProvider) runs at Application.onCreate() — before any JS. If it starts
  // with an empty publishable key it throws IllegalStateException and the process
  // dies immediately. Only POS builds have the Stripe publishable key set, so we
  // must NOT include the @stripe/stripe-react-native config plugin for other roles.
  const basePlugins: ExpoConfig['plugins'] = [
    'expo-router',
    'expo-secure-store',
    // Sentry plugin DISABLED for v2.7.7 diagnostic — the Sentry ContentProviders
    // (SentryInitProvider / SentryPerformanceProvider) fire at Application.onCreate()
    // BEFORE any JS runs. Suspected of crashing on iMin + generic Android tablet
    // (straight-to-black with no splash, confirmed native-side crash).
    // Re-enable once Sentry 6.0.x upstream issue is resolved or downgraded.
    // [
    //   '@sentry/react-native/expo',
    //   {
    //     organization: 'elevatedpos',
    //     project: 'elevatedpos-mobile',
    //   },
    // ],
    './plugins/withCleartextTraffic',
    './plugins/withGradleWrapper',
    './plugins/withUsbPrinter',
    './plugins/withUsbPrinterPatch',
    './plugins/withTimApiBridge',
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
  ];

  // Only include the Stripe native plugin for POS builds (or unspecified role for dev).
  // All other roles (kds, kiosk, dashboard, display) do not use Stripe and the native
  // initializer crashes on launch when no publishable key is present.
  if (!ROLE_LOCK || ROLE_LOCK === 'pos') {
    basePlugins.push([
      '@stripe/stripe-react-native',
      {
        merchantIdentifier: 'merchant.au.elevatedpos',
        enableGooglePay: true,
      },
    ]);
  }

  return {
  ...config,
  owner: 'kbservicesau',
  name: resolved?.name ?? process.env['EXPO_PUBLIC_APP_NAME'] ?? 'ElevatedPOS',
  slug: resolved?.slug ?? 'elevatedpos',
  version: '2.7.54',
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
  plugins: basePlugins,
  // OTA updates DISABLED — a poisoned JS bundle was published for runtime '2.7.5'
  // (from the v2.7.4 diagnostic commit) and every APK built against that runtime
  // was fetching it on launch → blank black screen. Bumping runtimeVersion to
  // '2.7.6' guarantees no matching OTA exists, and checkAutomatically='NEVER'
  // means the APK always boots its own bundled JS rather than fetching remote.
  // Re-enable OTA only after republishing a verified-good bundle on this runtime.
  updates: {
    enabled: false,
    url: 'https://u.expo.dev/5f03d9c6-0120-4047-aa27-f71a823afa7b',
    fallbackToCacheTimeout: 0,
    checkAutomatically: 'NEVER',
  },
  runtimeVersion: '2.7.54',
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: process.env['EAS_PROJECT_ID'] ?? '5f03d9c6-0120-4047-aa27-f71a823afa7b' },
    roleLock: ROLE_LOCK ?? null,
  },
  };
};
