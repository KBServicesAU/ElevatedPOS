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
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { Slot, useRouter, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from '@stripe/stripe-react-native';
import { useDeviceStore } from '../store/device';
import { useDeviceSettings } from '../store/device-settings';
import { ToastViewport, AlertDialogHost } from '../components/ui';
import { RootErrorBoundary } from '../components/ErrorBoundary';

const stripePublishableKey = process.env['EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY'] ?? '';

SplashScreen.preventAutoHideAsync();

/** How often to ping the server to check that this device is still authorised. */
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export default function RootLayout() {
  const { ready, _hydrate, identity, checkHeartbeat } = useDeviceStore();
  const fetchDeviceSettings = useDeviceSettings((s) => s.fetch);
  const router = useRouter();
  const pathname = usePathname();
  const previousIdentity = useRef(identity);

  // Hydrate stored identity on mount, then fetch server-side device config
  useEffect(() => {
    _hydrate().then(() => {
      // Non-fatal if it fails — app still works with local fallbacks.
      fetchDeviceSettings().catch(() => { /* ignore */ });
    });
  }, [_hydrate, fetchDeviceSettings]);

  // Hide the splash only after the component has re-rendered with ready=true.
  // Calling hideAsync() inside the _hydrate().then() callback races with
  // React's state flush — the splash can vanish before the first real frame
  // renders, leaving a black screen on slower devices.
  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

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

  // Render a visible loading screen while hydration completes so operators
  // don't see a blank black window (happens when splash auto-hides ahead of
  // the first React commit, or when SecureStore hydration is slow).
  if (!ready) {
    return (
      <View style={loadingStyles.root}>
        <ActivityIndicator size="large" color="#4f46e5" />
        <Text style={loadingStyles.text}>Starting up…</Text>
      </View>
    );
  }

  const content = (
    <SafeAreaProvider>
      <View style={{ flex: 1 }}>
        <Slot />
        <ToastViewport />
        <AlertDialogHost />
      </View>
    </SafeAreaProvider>
  );

  // Only wrap in StripeProvider when a publishable key is available (POS builds).
  // Non-POS builds (KDS, Kiosk, Display, Dashboard) don't have the key set and
  // initialising the native Stripe SDK with an empty key crashes the app on Android.
  const providerContent = stripePublishableKey ? (
    <StripeProvider publishableKey={stripePublishableKey} urlScheme="elevatedpos">
      {content}
    </StripeProvider>
  ) : content;

  return <RootErrorBoundary>{providerContent}</RootErrorBoundary>;
}

const loadingStyles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d0f1f' },
  text: { marginTop: 16, color: '#9ca3af', fontSize: 15 },
});
