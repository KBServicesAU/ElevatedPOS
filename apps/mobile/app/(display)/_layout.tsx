import { useEffect } from 'react';
import { Slot, useRouter } from 'expo-router';
import { useDeviceStore } from '../../store/device';
import * as ScreenOrientation from 'expo-screen-orientation';
import { ActivityIndicator, View } from 'react-native';

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

  // While hydrating, show a dark placeholder matching the splash background so
  // there's no jarring flash of black between the native splash and first frame.
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#6366f1" />
      </View>
    );
  }

  // Identity check is async (redirect fires in useEffect above). Show dark
  // placeholder during the navigation frame — avoids bare black screen.
  if (!identity) {
    return <View style={{ flex: 1, backgroundColor: '#0a0a0a' }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Slot />
    </View>
  );
}
