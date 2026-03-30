import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0a0a0a' },
          headerTintColor: '#ffffff',
          headerTitleStyle: { fontWeight: 'bold', fontSize: 20 },
          contentStyle: { backgroundColor: '#000000' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="attract" options={{ headerShown: false }} />
        <Stack.Screen
          name="order-type"
          options={{ title: 'How Are You Dining?', headerBackVisible: false }}
        />
        <Stack.Screen
          name="loyalty"
          options={{ title: 'Sign In for Rewards', headerBackVisible: true }}
        />
        <Stack.Screen name="menu" options={{ title: 'NEXUS Kiosk', headerBackVisible: false }} />
        <Stack.Screen name="age-verification" options={{ headerShown: false }} />
        <Stack.Screen name="cart" options={{ title: 'Your Order', headerBackVisible: true }} />
        <Stack.Screen name="payment" options={{ title: 'Payment', headerBackVisible: true }} />
        <Stack.Screen
          name="confirmation"
          options={{ title: 'Order Confirmed', headerBackVisible: false }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
