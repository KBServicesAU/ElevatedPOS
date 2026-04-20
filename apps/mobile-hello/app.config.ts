import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  owner: 'kbservicesau',
  name: 'ElevatedPOS Hello',
  slug: 'elevatedpos',
  version: '1.0.0',
  scheme: 'elevatedposhello',
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
    bundleIdentifier: 'com.au.elevatedpos.hello',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0a0a0a',
    },
    package: 'com.au.elevatedpos.hello',
  },
  plugins: ['expo-router'],
  runtimeVersion: '1.0.0',
  extra: {
    eas: { projectId: '5f03d9c6-0120-4047-aa27-f71a823afa7b' },
  },
});
