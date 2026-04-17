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
// Wrap in try/catch because if this throws, the whole module fails to load and
// the user sees a blank black screen with no way to recover.
try {
  initSentry();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('[_layout] initSentry threw:', err);
}

import { useEffect, useRef, useState } from 'react';
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
const APP_VERSION = '2.7.3';
const BUILD_TAG = 'v2.7.3 — blank-screen debug';

SplashScreen.preventAutoHideAsync();

/** How often to ping the server to check that this device is still authorised. */
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export default function RootLayout() {
  const { ready, _hydrate, identity, checkHeartbeat } = useDeviceStore();
  const fetchDeviceSettings = useDeviceSettings((s) => s.fetch);
  const router = useRouter();
  const pathname = usePathname();
  const previousIdentity = useRef(identity);
  // Visible diagnostic step counter: the loading screen shows which stage
  // of startup we're currently in, so a permanently-blank screen can be
  // distinguished from a stuck hydrate/stuck splash.
  const [stage, setStage] = useState<string>('mounted');

  // Hydrate stored identity on mount, then fetch server-side device config
  useEffect(() => {
    setStage('hydrating SecureStore…');
    _hydrate().then(() => {
      setStage('fetching device settings…');
      // Non-fatal if it fails — app still works with local fallbacks.
      fetchDeviceSettings().catch(() => { /* ignore */ });
      setStage('ready');
    }).catch((err) => {
      setStage(`hydrate failed: ${err?.message ?? String(err)}`);
    });
  }, [_hydrate, fetchDeviceSettings]);

  // Force the splash to hide after at most 3 seconds regardless. If the
  // hydrate chain stalls for any reason, we still want content to paint —
  // the loading screen below will show the current stage and the user can
  // at least see the app is alive.
  useEffect(() => {
    const forceHideTimer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => { /* ignore */ });
    }, 3000);
    return () => clearTimeout(forceHideTimer);
  }, []);

  // Hide the splash once hydration completes.
  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => { /* ignore */ });
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
      <RootErrorBoundary>
        <View style={loadingStyles.root}>
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text style={loadingStyles.title}>ElevatedPOS</Text>
          <Text style={loadingStyles.version}>{BUILD_TAG}</Text>
          <Text style={loadingStyles.text}>Stage: {stage}</Text>
        </View>
      </RootErrorBoundary>
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
  // Wrap StripeProvider init in its own try/catch so a Stripe native-module
  // failure doesn't take down the whole app.
  let providerContent;
  try {
    providerContent = stripePublishableKey ? (
      <StripeProvider publishableKey={stripePublishableKey} urlScheme="elevatedpos">
        {content}
      </StripeProvider>
    ) : content;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[_layout] StripeProvider init threw:', err);
    providerContent = content;
  }

  return <RootErrorBoundary>{providerContent}</RootErrorBoundary>;
}

const loadingStyles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d0f1f', padding: 24 },
  title: { marginTop: 24, color: '#e5e7eb', fontSize: 22, fontWeight: '800' },
  version: { marginTop: 4, color: '#60a5fa', fontSize: 13, fontFamily: 'monospace' },
  text: { marginTop: 12, color: '#9ca3af', fontSize: 14, textAlign: 'center' },
});
