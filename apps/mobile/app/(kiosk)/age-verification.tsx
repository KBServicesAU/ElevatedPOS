import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKioskStore } from '../../store/kiosk';

export default function AgeVerificationScreen() {
  const router = useRouter();
  const { setAgeVerified, removeFromCart, pendingAgeRestrictedProductId, setPendingAgeRestrictedProductId } = useKioskStore();

  function handleConfirm() {
    setAgeVerified(true);
    setPendingAgeRestrictedProductId(null);
    router.back();
  }

  function handleDeny() {
    if (pendingAgeRestrictedProductId) {
      removeFromCart(pendingAgeRestrictedProductId);
    }
    setPendingAgeRestrictedProductId(null);
    router.back();
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.icon}>🔞</Text>
        <Text style={styles.title}>Age Verification Required</Text>
        <Text style={styles.subtitle}>
          This item is restricted to customers aged 18 and over.
          {'\n\n'}
          By confirming, you declare that you are 18 years of age or older.
        </Text>

        <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm} activeOpacity={0.85}>
          <Text style={styles.confirmBtnText}>Yes, I am 18 or older</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.denyBtn} onPress={handleDeny} activeOpacity={0.85}>
          <Text style={styles.denyBtnText}>No, remove item</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card: { backgroundColor: '#141414', borderRadius: 24, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a', maxWidth: 440, width: '100%' },
  icon: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#888', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  confirmBtn: { width: '100%', backgroundColor: '#f97316', borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginBottom: 12 },
  confirmBtnText: { fontSize: 17, fontWeight: '800', color: '#fff' },
  denyBtn: { width: '100%', backgroundColor: '#1e1e1e', borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  denyBtnText: { fontSize: 16, fontWeight: '600', color: '#888' },
});
