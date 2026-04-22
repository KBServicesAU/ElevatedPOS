import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { AnzBridgeProvider } from '../../components/AnzBridgeHost';
import { useAnzStore } from '../../store/anz';
import { useTillStore } from '../../store/till';

/**
 * Kiosk root layout.
 *
 * v2.7.40 — wraps the kiosk stack in <AnzBridgeProvider> so the hidden
 * TIM API WebView stays alive across the attract → menu → cart → payment
 * flow. The bridge needs terminal config (from useAnzStore) and the till
 * state (useTillStore) to be hydrated before it can mount a transaction,
 * so we hydrate both on mount — kiosks never run through the POS layout
 * which normally handles this.
 */
export default function KioskLayout() {
  const hydrateAnz = useAnzStore((s) => s.hydrate);
  const hydrateTill = useTillStore((s) => s.hydrate);

  useEffect(() => {
    hydrateAnz();
    hydrateTill();
  }, []);

  return (
    <AnzBridgeProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
    </AnzBridgeProvider>
  );
}
