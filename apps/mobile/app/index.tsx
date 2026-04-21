import { Redirect, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useDeviceStore } from '../store/device';
import { useAuthStore } from '../store/auth';

const ROLE_LOCK = process.env['EXPO_PUBLIC_ROLE_LOCK'] as 'pos' | 'kds' | 'kiosk' | 'dashboard' | 'display' | undefined;

export default function Index() {
  const { identity, ready } = useDeviceStore();
  // Employee state is in-memory only (no persisted hydration), so there's
  // no "authReady" flag to wait on — null means no login yet.
  const employee = useAuthStore((s) => s.employee);

  // Dashboard app — requires a paired device identity before entering
  if (ROLE_LOCK === 'dashboard') {
    if (!ready) return null;
    if (!identity) return <Redirect href="/pair" />;
    return <Redirect href="/(dashboard)" />;
  }

  // Display app goes straight to the display screen (layout handles auth redirect)
  if (ROLE_LOCK === 'display') {
    if (!ready) return null;
    if (!identity) return <Redirect href="/pair" />;
    return <Redirect href="/(display)" />;
  }

  if (!ready) return null;
  if (!identity) return <Redirect href="/pair" />;

  // If this build is locked to a specific role, enforce it
  if (ROLE_LOCK && identity.role !== ROLE_LOCK) {
    return (
      <View style={styles.error}>
        <Text style={styles.errorTitle}>Wrong Device Type</Text>
        <Text style={styles.errorSub}>
          This app is locked to the {ROLE_LOCK.toUpperCase()} role.{'\n'}
          This device is paired as {identity.role.toUpperCase()}.{'\n'}
          Please unpair and re-pair with the correct code.
        </Text>
      </View>
    );
  }

  const role = ROLE_LOCK ?? identity.role;

  // POS requires employee login before access. Bug fix (v2.7.22): this
  // route used to redirect to /employee-login unconditionally, so every
  // tap on the Sell sidebar item (which navigates to `/`) bounced a
  // logged-in operator back to the PIN screen — looked exactly like
  // being logged out.
  //
  // v2.7.23 — target `/sell` instead of `/(pos)`. The `/` URL used to
  // resolve BOTH to this root router AND to `(pos)/index.tsx`; depending
  // on nav state expo-router sometimes unmounted (pos)/_layout.tsx on
  // every Sell tap, which tore down AnzBridgeProvider and disconnected
  // the ANZ terminal. The Sell screen now lives at its own URL so there
  // is only one route candidate per URL.
  if (role === 'pos') {
    if (!employee) return <Redirect href="/employee-login" />;
    return <Redirect href="/sell" />;
  }
  if (role === 'dashboard') return <Redirect href="/login" />;
  if (role === 'kds') return <Redirect href="/(kds)" />;
  if (role === 'display') return <Redirect href="/(display)" />;
  return <Redirect href="/(kiosk)/attract" />;
}

const styles = StyleSheet.create({
  error: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorTitle: { fontSize: 24, fontWeight: '900', color: '#ef4444', marginBottom: 16, textAlign: 'center' },
  errorSub: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 24 },
});
