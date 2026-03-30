import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../store/auth';
import { useOfflineSync } from '../hooks/useOfflineSync';

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

export default function RootLayout() {
  // Hydrate persisted auth from AsyncStorage on first mount
  useEffect(() => {
    useAuthStore.getState()._hydrate();
  }, []);

  // Start offline sync listener (initializes SQLite DB + NetInfo subscription)
  useOfflineSync();

  return (
    <>
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
      <StatusBar style="light" />
    </>
  );
}
