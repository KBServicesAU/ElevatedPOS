import { useEffect } from 'react';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useDeviceStore } from '../store/device';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { ready, _hydrate } = useDeviceStore();
  useEffect(() => {
    _hydrate().then(() => SplashScreen.hideAsync());
  }, [_hydrate]);
  if (!ready) return null;
  return <SafeAreaProvider><Slot /></SafeAreaProvider>;
}
