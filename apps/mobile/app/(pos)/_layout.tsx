import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Platform } from 'react-native';

export default function PosLayout() {
  // On tablets (landscape), show icons on the left side bar
  // On phones, keep the bottom tab bar
  return (
    <Tabs screenOptions={{
      tabBarStyle: {
        backgroundColor: '#0d0d14',
        borderTopColor: '#1e1e2e',
        borderTopWidth: 1,
        height: 54,
        paddingBottom: Platform.OS === 'ios' ? 20 : 4,
      },
      tabBarActiveTintColor: '#6366f1',
      tabBarInactiveTintColor: '#555',
      tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      tabBarIconStyle: { marginBottom: -2 },
      headerShown: false,
    }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Sell',
          tabBarIcon: ({ color, size }) => <Ionicons name="cart" color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt" color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Customers',
          tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Ionicons name="menu" color={color} size={20} />,
        }}
      />
    </Tabs>
  );
}
