import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function PosLayout() {
  return (
    <Tabs screenOptions={{
      tabBarStyle: { backgroundColor: '#1a1a2e', borderTopColor: '#2a2a3a' },
      tabBarActiveTintColor: '#6366f1', tabBarInactiveTintColor: '#666',
      headerStyle: { backgroundColor: '#1a1a2e' }, headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: '800' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Sell', headerTitle: 'ElevatedPOS', tabBarIcon: ({ color, size }) => <Ionicons name="cart-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="customers" options={{ title: 'Customers', tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal-outline" color={color} size={size} /> }} />
    </Tabs>
  );
}
