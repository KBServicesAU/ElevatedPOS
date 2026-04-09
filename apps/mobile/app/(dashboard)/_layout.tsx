import { Stack } from 'expo-router';

export default function DashboardLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0d0d14' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '800' },
        contentStyle: { backgroundColor: '#0d0d14' },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'ElevatedPOS', headerShown: false }}
      />
      <Stack.Screen
        name="web"
        options={{ title: 'Dashboard', headerShown: false }}
      />
    </Stack>
  );
}
