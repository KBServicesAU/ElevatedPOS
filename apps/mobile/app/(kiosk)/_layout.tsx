import React, { useCallback, useEffect, useRef } from 'react';
import { Stack, useRouter, usePathname } from 'expo-router';
import { AppState, type AppStateStatus, StyleSheet, TouchableWithoutFeedback, View } from 'react-native';
import { AnzBridgeProvider } from '../../components/AnzBridgeHost';
import { useAnzStore } from '../../store/anz';
import { useKioskStore } from '../../store/kiosk';
import { useTillStore } from '../../store/till';

/**
 * Kiosk root layout.
 *
 * v2.7.40 combines two additive features:
 *   1. ANZ bridge provider — wraps the kiosk stack in <AnzBridgeProvider>
 *      so the hidden TIM API WebView stays alive across attract → menu →
 *      cart → payment. Hydrates the ANZ store + till store on mount
 *      because the kiosk flow never runs through the POS layout which
 *      normally does that.
 *   2. Hidden staff-settings gesture — a 60×60 invisible hit-zone in
 *      the top-left corner. Tap it 5 times within 3 seconds to
 *      navigate to `/settings`. The gesture count resets if the
 *      3-second window lapses, so stray single-taps by a curious
 *      customer are harmless. The settings screen itself challenges
 *      the operator with a 4-digit PIN before showing any content.
 *
 * v2.7.70 — C16 global idle timeout. Previously only the attract screen
 * had an idle timer. If a customer started a transaction (menu → cart →
 * loyalty / age-verification / payment) and walked away mid-flow, the
 * kiosk would sit on that screen forever — leaking PII (loyalty email,
 * cart contents, scanned ID), holding line space, and blocking the next
 * customer. We now run a global timer at the layout level that fires
 * `resetOrder()` and routes back to attract whenever no touch has
 * happened for IDLE_TIMEOUT_MS, on every screen except attract itself
 * and the post-payment confirmation (which has its own auto-return).
 */
const IDLE_TIMEOUT_MS = 90_000;

/** Screens that opt out of the global idle timer. */
const IDLE_EXEMPT_PATHS = new Set<string>([
  '/(kiosk)/attract',
  '/(kiosk)/confirmation',
  '/(kiosk)/settings', // staff-only — they should not get bumped mid-config
]);

export default function KioskLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const hydrateAnz = useAnzStore((s) => s.hydrate);
  const hydrateTill = useTillStore((s) => s.hydrate);
  const resetOrder = useKioskStore((s) => s.resetOrder);
  const tapsRef = useRef<number[]>([]);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundTimestamp = useRef<number | null>(null);

  useEffect(() => {
    hydrateAnz();
    hydrateTill();
  }, []);

  // v2.7.70 — guard exemption-list lookup: pathname comes from expo-router
  // and may be either '/(kiosk)/attract' or '/(kiosk)/attract/' style;
  // strip a trailing slash before comparison.
  const isExempt = useCallback((p: string | null) => {
    if (!p) return true;
    const norm = p.endsWith('/') ? p.slice(0, -1) : p;
    return IDLE_EXEMPT_PATHS.has(norm);
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    if (isExempt(pathname)) return;
    idleTimer.current = setTimeout(() => {
      resetOrder();
      router.replace('/(kiosk)/attract');
    }, IDLE_TIMEOUT_MS);
  }, [pathname, isExempt, resetOrder, router]);

  // Re-arm the timer on every route change (and clear it when entering
  // an exempt screen). Without this, navigating from menu → confirmation
  // would leave the menu's timer running, bumping the user mid-receipt.
  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [pathname, resetIdleTimer]);

  // App-state handling: if the kiosk is backgrounded (screen off,
  // notification panel pulled, etc.) for longer than IDLE_TIMEOUT_MS,
  // reset on resume regardless of what the in-process timer says.
  useEffect(() => {
    function handleAppStateChange(nextState: AppStateStatus) {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundTimestamp.current = Date.now();
      } else if (nextState === 'active') {
        if (backgroundTimestamp.current !== null) {
          const elapsed = Date.now() - backgroundTimestamp.current;
          backgroundTimestamp.current = null;
          if (elapsed >= IDLE_TIMEOUT_MS && !isExempt(pathname)) {
            resetOrder();
            router.replace('/(kiosk)/attract');
            return;
          }
        }
        resetIdleTimer();
      }
    }
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [pathname, isExempt, resetOrder, router, resetIdleTimer]);

  function handleHiddenTap() {
    const now = Date.now();
    // Keep only taps from the last 3 seconds.
    tapsRef.current = tapsRef.current.filter((t) => now - t < 3000);
    tapsRef.current.push(now);
    if (tapsRef.current.length >= 5) {
      tapsRef.current = [];
      router.push('/(kiosk)/settings' as never);
    }
  }

  return (
    <AnzBridgeProvider>
      {/* v2.7.70 — onTouchStart on the parent View fires for every touch
          but does not consume the event, so child controls (buttons,
          inputs) keep working. We use it as a passive "user is active"
          signal to re-arm the idle timer. */}
      <View style={{ flex: 1 }} onTouchStart={resetIdleTimer}>
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
        <TouchableWithoutFeedback onPress={handleHiddenTap}>
          <View style={styles.hiddenHitZone} />
        </TouchableWithoutFeedback>
      </View>
    </AnzBridgeProvider>
  );
}

const styles = StyleSheet.create({
  hiddenHitZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 60,
    height: 60,
    // Transparent — but must be touchable. `backgroundColor: 'transparent'`
    // on RN Android is still hit-testable as long as the view has a size.
    backgroundColor: 'transparent',
  },
});
