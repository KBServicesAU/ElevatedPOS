import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { OfflineBanner } from '../../components/OfflineBanner';

export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <Tabs
        screenOptions={{
          tabBarStyle: { backgroundColor: '#16161f', borderTopColor: '#2a2a3a' },
          tabBarActiveTintColor: '#818cf8',
          tabBarInactiveTintColor: '#6b7280',
          headerStyle: { backgroundColor: '#1e1e2e' },
          headerTintColor: '#fff',
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Sell',
            tabBarIcon: ({ color, size }) => <Ionicons name="cart" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: 'Orders',
            tabBarIcon: ({ color, size }) => <Ionicons name="receipt" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="customers"
          options={{
            title: 'Customers',
            tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: ({ color, size }) => <Ionicons name="menu" color={color} size={size} />,
          }}
        />
      </Tabs>
    </View>
  );
}
