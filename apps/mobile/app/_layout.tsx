// Polyfill AbortSignal.timeout — not available in Hermes on older Android builds.
// Must be at the top of the entry file before any fetch calls are made.
if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout !== 'function') {
  (AbortSignal as any).timeout = function timeout(ms: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => {
      const err = new Error('The operation timed out.');
      err.name = 'TimeoutError';
      controller.abort(err);
    }, ms);
    return controller.signal;
  };
}

import { initSentry } from '../lib/sentry';
// Initialise Sentry before any component renders so startup errors are captured.
initSentry();

import { useEffect, useRef } from 'react';
import { AppState, View } from 'react-native';
import { Slot, useRouter, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from '@stripe/stripe-react-native';
import { useDeviceStore } from '../store/device';
import { useDeviceSettings } from '../store/device-settings';
import { ToastViewport, AlertDialogHost } from '../components/ui';

const stripePublishableKey = process.env['EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY'] ?? '';

SplashScreen.preventAutoHideAsync();

/** How often to ping the server to check that this device is still authorised. */
const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export default function RootLayout() {
  const { ready, _hydrate, identity, checkHeartbeat } = useDeviceStore();
  const fetchDeviceSettings = useDeviceSettings((s) => s.fetch);
  const router = useRouter();
  const pathname = usePathname();
  const previousIdentity = useRef(identity);

  // Hydrate stored identity on mount, then fetch server-side device config
  useEffect(() => {
    _hydrate().then(() => {
      SplashScreen.hideAsync();
      // Fetch server-managed settings (terminal, printers, display) after hydration.
      // Non-fatal if it fails — app still works with local fallbacks.
      fetchDeviceSettings().catch(() => { /* ignore */ });
    });
  }, [_hydrate, fetchDeviceSettings]);

  // Periodic heartbeat: detects when the device has been revoked server-side
  // and forces a redirect to the pair screen so the user can re-pair.
  useEffect(() => {
    if (!identity) return;
    // Kick off an immediate check so revoked devices are caught on app focus,
    // not just after the next interval.
    checkHeartbeat().catch(() => { /* ignore */ });

    const interval = setInterval(() => {
      checkHeartbeat().catch(() => { /* ignore */ });
    }, HEARTBEAT_INTERVAL_MS);

    // Also check on app resume (foreground)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkHeartbeat().catch(() => { /* ignore */ });
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [identity, checkHeartbeat]);

  // Watch identity — if it transitions from set → null (i.e. revoked), force
  // redirect away from any role-specific screen to /pair.
  useEffect(() => {
    if (previousIdentity.current && !identity) {
      // Only redirect if we're not already on pair or login screens
      if (pathname !== '/pair' && pathname !== '/login' && pathname !== '/employee-login') {
        router.replace('/pair');
      }
    }
    previousIdentity.current = identity;
  }, [identity, pathname, router]);

  if (!ready) return null;
  return (
    <StripeProvider publishableKey={stripePublishableKey} urlScheme="elevatedpos">
      <SafeAreaProvider>
        <View style={{ flex: 1 }}>
          <Slot />
          <ToastViewport />
          <AlertDialogHost />
        </View>
      </SafeAreaProvider>
    </StripeProvider>
  );
}
