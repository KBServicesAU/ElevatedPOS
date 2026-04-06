import { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../store/auth';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { useInactivityTimer } from '../hooks/useInactivityTimer';

// ─── Inactivity wrapper ──────────────────────────────────────────────────────
// Resets the inactivity timer on every touch anywhere in the app.

function InactivityOverlay({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  const onExpired = useCallback(() => {
    logout();
    router.replace('/login');
  }, [logout, router]);

  const { showWarning, secondsRemaining, resetTimer } = useInactivityTimer(onExpired);

  return (
    <View
      style={styles.overlay}
      onStartShouldSetResponderCapture={() => {
        resetTimer();
        return false; // don't steal touches from children
      }}
    >
      {children}
      {showWarning && secondsRemaining !== null && secondsRemaining > 0 && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            Session expiring in {secondsRemaining} second{secondsRemaining !== 1 ? 's' : ''}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Auth guard ──────────────────────────────────────────────────────────────

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    const inLoginScreen = segments[0] === 'login';
    if (!isAuthenticated && !inLoginScreen) {
      router.replace('/login');
    } else if (isAuthenticated && inLoginScreen) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, segments]);

  return <>{children}</>;
}

// ─── Root layout ─────────────────────────────────────────────────────────────

export default function RootLayout() {
  // Hydrate persisted auth from AsyncStorage on first mount
  useEffect(() => {
    useAuthStore.getState()._hydrate();
  }, []);

  // Start offline sync listener (initializes SQLite DB + NetInfo subscription)
  useOfflineSync();

  return (
    <>
      <InactivityOverlay>
        <AuthGuard>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: '#1e1e2e' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
              contentStyle: { backgroundColor: '#1e1e2e' },
            }}
          >
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="payment"
              options={{
                title: 'Payment',
                headerShown: false,
                presentation: 'modal',
              }}
            />
          </Stack>
        </AuthGuard>
      </InactivityOverlay>
      <StatusBar style="light" />
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  warningBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#b91c1c',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    zIndex: 9999,
  },
  warningText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
