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
  // MINIMAL plugin set for blank-screen diagnostic.
  //
  // Installed APKs (v2.7.3 and prior) go straight to black with no splash
  // on iMin devices, which is an Android-level crash at Application.onCreate()
  // — before any JS runs. Without logcat access we're narrowing by
  // elimination: strip every plugin that touches native init and see which
  // role still renders the splash. After this lands we add plugins back one
  // at a time.
  //
  // Temporarily removed:
  //   • @sentry/react-native/expo — registers a native auto-init that can
  //     throw during Application.onCreate() if the DSN / env is wrong.
  //   • withUsbPrinter — adds <receiver> for com.pinmi.react.printer.*
  //     classes to the manifest. If autolinking fails to link the native
  //     class for any reason (version mismatch, missing dep), Android
  //     ClassNotFoundExceptions at boot.
  //   • withUsbPrinterPatch — patches source of the same library; harmless
  //     on its own but the library it patches is the culprit above.
  //   • @stripe/stripe-react-native — not needed for non-POS and crashes
  //     with empty publishable key.
  //
  // Kept:
  //   • expo-router (core navigation)
  //   • expo-secure-store (device identity persistence)
  //   • withCleartextTraffic (manifest flag only, no native init)
  //   • withGradleWrapper (build-time only)
  //   • withTimApiBridge (just copies asset files, no native init)
  //   • expo-build-properties + expo-splash-screen + expo-screen-orientation
  //     (standard Expo modules; these always worked before)
  const basePlugins: ExpoConfig['plugins'] = [
    'expo-router',
    'expo-secure-store',
    './plugins/withCleartextTraffic',
    './plugins/withGradleWrapper',
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

  return {
  ...config,
  owner: 'kbservicesau',
  name: resolved?.name ?? process.env['EXPO_PUBLIC_APP_NAME'] ?? 'ElevatedPOS',
  slug: resolved?.slug ?? 'elevatedpos',
  version: '2.7.4',
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
  // OTA updates are DISABLED. When enabled with checkAutomatically: 'ON_LOAD'
  // the app blocks on a network request to u.expo.dev before rendering; on
  // iMin / captive-network devices this can produce a long blank-screen
  // window while the client waits for the 5s fallback. We'll re-enable OTA
  // once the root-cause of the install-time blank screen is understood.
  updates: {
    enabled: false,
    checkAutomatically: 'NEVER',
  },
  runtimeVersion: '2.7.4',
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: process.env['EAS_PROJECT_ID'] ?? '5f03d9c6-0120-4047-aa27-f71a823afa7b' },
    roleLock: ROLE_LOCK ?? null,
  },
  };
};
