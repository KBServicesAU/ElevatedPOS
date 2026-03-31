import type { ConfigContext, ExpoConfig } from 'expo/config';

const ROLE_LOCK = process.env['EXPO_PUBLIC_ROLE_LOCK'] as 'pos' | 'kds' | 'kiosk' | undefined;

const roleConfig: Record<
  'pos' | 'kds' | 'kiosk',
  { name: string; slug: string; bundleIdentifier: string; package: string }
> = {
  pos: {
    name: 'NEXUS POS',
    slug: 'nexus-pos',
    bundleIdentifier: 'com.nexuspos.pos',
    package: 'com.nexuspos.pos',
  },
  kds: {
    name: 'NEXUS KDS',
    slug: 'nexus-kds',
    bundleIdentifier: 'com.nexuspos.kds',
    package: 'com.nexuspos.kds',
  },
  kiosk: {
    name: 'NEXUS Kiosk',
    slug: 'nexus-kiosk',
    bundleIdentifier: 'com.nexuspos.kiosk',
    package: 'com.nexuspos.kiosk',
  },
};

const resolved = ROLE_LOCK ? roleConfig[ROLE_LOCK] : null;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: resolved?.name ?? process.env['EXPO_PUBLIC_APP_NAME'] ?? 'NEXUS',
  slug: resolved?.slug ?? 'nexus-mobile',
  version: '1.0.0',
  scheme: 'nexus',
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
    bundleIdentifier: resolved?.bundleIdentifier ?? process.env['APP_BUNDLE_ID_IOS'] ?? 'com.nexuspos.mobile',
    requireFullScreen: true,
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0a0a0a',
    },
    package: resolved?.package ?? process.env['APP_PACKAGE_ANDROID'] ?? 'com.nexuspos.mobile',
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
    eas: { projectId: process.env['EAS_PROJECT_ID'] ?? '' },
    roleLock: ROLE_LOCK ?? null,
  },
});
