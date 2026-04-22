import React, { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StyleSheet, TouchableWithoutFeedback, View } from 'react-native';
import { AnzBridgeProvider } from '../../components/AnzBridgeHost';
import { useAnzStore } from '../../store/anz';
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
 * Both are strictly additive — the Stack navigator below is unchanged;
 * the overlay is a sibling `View` that only intercepts touches inside
 * its 60×60 footprint, outside every customer-facing control.
 */
export default function KioskLayout() {
  const router = useRouter();
  const hydrateAnz = useAnzStore((s) => s.hydrate);
  const hydrateTill = useTillStore((s) => s.hydrate);
  const tapsRef = useRef<number[]>([]);

  useEffect(() => {
    hydrateAnz();
    hydrateTill();
  }, []);

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
      <View style={{ flex: 1 }}>
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
