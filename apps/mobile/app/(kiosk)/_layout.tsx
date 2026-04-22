import { Stack, useRouter } from 'expo-router';
import { useRef } from 'react';
import { StyleSheet, TouchableWithoutFeedback, View } from 'react-native';

/**
 * Kiosk group layout.
 *
 * Also hosts the HIDDEN staff-settings gesture (v2.7.40):
 *   - A 60×60 invisible hit-zone pinned to the top-left corner of the
 *     screen overlays every kiosk screen.
 *   - Tap it 5 times within 3 seconds to navigate to `/settings`.
 *   - The gesture count resets on the next tap if the 3-second window
 *     has lapsed, so stray single-taps by a curious customer are harmless.
 *   - The settings screen itself additionally challenges the operator
 *     with a 4-digit PIN before showing any content. See
 *     `app/(kiosk)/settings.tsx` for details.
 *
 * This is strictly additive to the customer-facing flow — the Stack
 * navigator below is unchanged; the overlay is a sibling `View` that
 * only intercepts touches inside its 60×60 footprint in the top-left
 * corner, which is outside every customer-facing control.
 */
export default function KioskLayout() {
  const router = useRouter();
  const tapsRef = useRef<number[]>([]);

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
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
      <TouchableWithoutFeedback onPress={handleHiddenTap}>
        <View style={styles.hiddenHitZone} />
      </TouchableWithoutFeedback>
    </View>
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
