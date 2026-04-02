import type { ConfigContext, ExpoConfig } from 'expo/config';

const ROLE_LOCK = process.env['EXPO_PUBLIC_ROLE_LOCK'] as 'pos' | 'kds' | 'kiosk' | undefined;

const roleConfig: Record<
  'pos' | 'kds' | 'kiosk',
  { name: string; slug: string; bundleIdentifier: string; package: string }
> = {
  pos: {
    name: 'ElevatedPOS',
    slug: 'elevatedpos-pos',
    bundleIdentifier: 'com.au.elevatedpos.pos',
    package: 'com.au.elevatedpos.pos',
  },
  kds: {
    name: 'ElevatedPOS KDS',
    slug: 'elevatedpos-kds',
    bundleIdentifier: 'com.au.elevatedpos.kds',
    package: 'com.au.elevatedpos.kds',
  },
  kiosk: {
    name: 'ElevatedPOS Kiosk',
    slug: 'elevatedpos-kiosk',
    bundleIdentifier: 'com.au.elevatedpos.kiosk',
    package: 'com.au.elevatedpos.kiosk',
  },
};

const resolved = ROLE_LOCK ? roleConfig[ROLE_LOCK] : null;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  owner: 'kbservicesau',
  name: resolved?.name ?? process.env['EXPO_PUBLIC_APP_NAME'] ?? 'ElevatedPOS',
  slug: resolved?.slug ?? 'elevatedpos-mobile',
  version: '1.0.0',
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
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0a0a0a',
    },
    package: resolved?.package ?? process.env['APP_PACKAGE_ANDROID'] ?? 'com.au.elevatedpos.mobile',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
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
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: process.env['EAS_PROJECT_ID'] ?? '5f03d9c6-0120-4047-aa27-f71a823afa7b' },
    roleLock: ROLE_LOCK ?? null,
  },
});
