import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useDeviceStore } from '../../store/device';

export default function KDSLayout() {
  const router = useRouter();
  const identity = useDeviceStore((s) => s.identity);
  const ready = useDeviceStore((s) => s.ready);
  const _hydrate = useDeviceStore((s) => s._hydrate);

  // Hydrate the device store on first mount if it hasn't been done yet.
  useEffect(() => {
    if (!ready) _hydrate();
  }, [ready, _hydrate]);

  // Guard: if the device has not been paired (no identity), send to /pair.
  // Also enforce the ROLE_LOCK: a KDS build should never be used by a device
  // that was paired with a different role (e.g. pos or kiosk).
  useEffect(() => {
    if (!ready) return;
    if (!identity) {
      router.replace('/pair');
      return;
    }
    // A KDS build (ROLE_LOCK='kds') must only run on a KDS-paired device.
    if (identity.role !== 'kds') {
      router.replace('/pair');
    }
  }, [ready, identity, router]);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => { ScreenOrientation.unlockAsync(); };
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
