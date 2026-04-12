import { useEffect } from 'react';
import { Slot, useRouter } from 'expo-router';
import { useDeviceStore } from '../../store/device';
import * as ScreenOrientation from 'expo-screen-orientation';
import { View } from 'react-native';

export default function DisplayLayout() {
  const { identity, ready } = useDeviceStore();
  const router = useRouter();

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      ScreenOrientation.unlockAsync();
    };
  }, []);

  useEffect(() => {
    if (ready && !identity) {
      router.replace('/pair');
    }
  }, [ready, identity, router]);

  if (!ready || !identity) return null;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Slot />
    </View>
  );
}
