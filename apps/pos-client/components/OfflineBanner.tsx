import { useNetInfo } from '@react-native-community/netinfo';
import { View, Text } from 'react-native';

export function OfflineBanner() {
  const netInfo = useNetInfo();
  if (netInfo.isConnected !== false) return null;
  return (
    <View style={{ backgroundColor: '#f59e0b', padding: 8, alignItems: 'center' }}>
      <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 12 }}>
        ⚡ OFFLINE — Transactions queuing locally
      </Text>
    </View>
  );
}
