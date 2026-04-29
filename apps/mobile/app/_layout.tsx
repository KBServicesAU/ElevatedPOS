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
// NOTE: `@stripe/stripe-react-native` is intentionally NOT imported at the top.
// Evaluation of its module body reaches into `NativeModules.StripeSdk`; if the
// native side fails to register (any Android linkage hiccup) the import itself
// throws. Because this file is the root of the expo-router entry, a throw here
// aborts module evaluation BEFORE `AppRegistry.registerComponent(...)` runs,
// producing a blank black screen with no JS-side stack available in release
// Hermes builds (emulator logcat confirms `Registered callable JavaScript
// modules (n = 0)` with no preceding JS error).
// We require() the native module lazily inside the component, only when a
// publishable key is present and only on platforms where it has any chance
// of resolving. Any failure falls back to rendering without Stripe so the
// rest of the app still boots.
import { useDeviceStore } from '../store/device';
import { useDeviceSettings } from '../store/device-settings';
import { useReconcileStore } from '../store/reconcile';
import { ToastViewport, AlertDialogHost } from '../components/ui';

const stripePublishableKey = process.env['EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY'] ?? '';

/**
 * Lazily resolves the StripeProvider component. Returns `null` when Stripe is
 * unavailable or throws during require — in which case the caller must render
 * the children directly instead of wrapping them. The require() happens at
 * call time, not at module-evaluation time, so a broken native binding does
 * not take the whole app down on launch.
 */
function resolveStripeProvider(): React.ComponentType<{
  publishableKey: string;
  urlScheme?: string;
  merchantIdentifier?: string;
  children: React.ReactNode;
}> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const mod = require('@stripe/stripe-react-native');
    return (mod?.StripeProvider ?? null) as never;
  } catch {
    return null;
  }
}

SplashScreen.preventAutoHideAsync();

/** How often to ping the server to check that this device is still authorised. */
const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

/** How often to retry orders that were charged but failed to mark complete.
 *  v2.7.70 — C12/C13 reconcile drain. We pick a relatively short interval
 *  (90s) to recover quickly from transient blips, but back off the user-
 *  visible toast so a sustained outage doesn't spam the screen. */
const RECONCILE_DRAIN_INTERVAL_MS = 90 * 1000;

export default function RootLayout() {
  const { ready, _hydrate, identity, checkHeartbeat } = useDeviceStore();
  const fetchDeviceSettings = useDeviceSettings((s) => s.fetch);
  const hydrateReconcile = useReconcileStore((s) => s.hydrate);
  const drainReconcile = useReconcileStore((s) => s.drain);
  const router = useRouter();
  const pathname = usePathname();
  const previousIdentity = useRef(identity);

  // Hydrate stored identity on mount, then fetch server-side device config
  useEffect(() => {
    _hydrate().then(() => {
      // Non-fatal if it fails — app still works with local fallbacks.
      fetchDeviceSettings().catch(() => { /* ignore */ });
      // v2.7.70 — load any orders that were charged but failed to mark
      // complete on a previous session, then immediately try to drain
      // them. The hydrate() resolves before any sale UI renders so the
      // count is accurate when Sell/Orders mount.
      hydrateReconcile()
        .then(() => drainReconcile())
        .catch(() => { /* ignore */ });
    });
  }, [_hydrate, fetchDeviceSettings, hydrateReconcile, drainReconcile]);

  // v2.7.70 — periodic reconcile drain. Cheap when the queue is empty
  // (early-return inside the store) so safe to run unconditionally.
  useEffect(() => {
    if (!identity) return;
    const interval = setInterval(() => {
      drainReconcile().catch(() => { /* ignore */ });
    }, RECONCILE_DRAIN_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') drainReconcile().catch(() => { /* ignore */ });
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [identity, drainReconcile]);

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

  if (!ready) return null;

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
  if (!stripePublishableKey) return content;

  // Lazy-resolve the StripeProvider at render time. If require() throws (broken
  // native binding, missing package, etc.) we silently fall back to rendering
  // without Stripe rather than crashing the entire app at startup.
  const StripeProvider = resolveStripeProvider();
  if (!StripeProvider) return content;

  return (
    <StripeProvider publishableKey={stripePublishableKey} urlScheme="elevatedpos">
      {content}
    </StripeProvider>
  );
}
