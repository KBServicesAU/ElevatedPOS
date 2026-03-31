import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKioskStore } from '../../store/kiosk';

const AUTO_RESET_SECONDS = 12;

export default function ConfirmationScreen() {
  const router = useRouter();
  const { orderNumber, loyaltyAccount, resetKiosk } = useKioskStore();
  const [countdown, setCountdown] = useState(AUTO_RESET_SECONDS);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  useEffect(() => {
    if (countdown <= 0) {
      resetKiosk();
      router.replace('/(kiosk)/attract');
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, resetKiosk, router]);

  function handleNewOrder() {
    resetKiosk();
    router.replace('/(kiosk)/attract');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.successCircle}>
        <Text style={styles.successIcon}>✓</Text>
      </View>

      <Text style={styles.title}>Order Placed!</Text>
      <Text style={styles.subtitle}>Your order is being prepared</Text>

      <Animated.View style={[styles.orderNumberCard, { transform: [{ scale: pulseAnim }] }]}>
        <Text style={styles.orderLabel}>Your Order Number</Text>
        <Text style={styles.orderNumber}>{orderNumber ?? '—'}</Text>
      </Animated.View>

      <View style={styles.waitCard}>
        <Text style={styles.waitIcon}>⏱</Text>
        <View>
          <Text style={styles.waitTitle}>Estimated Wait</Text>
          <Text style={styles.waitTime}>10–15 minutes</Text>
        </View>
      </View>

      {loyaltyAccount && (
        <View style={styles.pointsCard}>
          <Text style={styles.pointsText}>
            🎉 You earned <Text style={styles.pointsHighlight}>+25 points</Text> on this order!
          </Text>
          <Text style={styles.pointsBalance}>New balance: {(loyaltyAccount.points + 25).toLocaleString()} pts</Text>
        </View>
      )}

      <View style={styles.qrPlaceholder}>
        <Text style={styles.qrText}>⬛ QR Receipt</Text>
        <Text style={styles.qrSub}>Scan to get a digital receipt</Text>
      </View>

      <Text style={styles.countdown}>Returning to home in {countdown}s...</Text>

      <TouchableOpacity style={styles.newOrderButton} onPress={handleNewOrder}>
        <Text style={styles.newOrderText}>Start New Order</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', paddingHorizontal: 32, paddingTop: 40, paddingBottom: 32 },
  successCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center', marginBottom: 20, shadowColor: '#16a34a', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 12 },
  successIcon: { fontSize: 52, color: '#fff', fontWeight: '900' },
  title: { fontSize: 34, fontWeight: '900', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 18, color: '#888', marginBottom: 32 },
  orderNumberCard: { backgroundColor: '#1a1a1a', borderRadius: 24, paddingVertical: 28, paddingHorizontal: 48, alignItems: 'center', borderWidth: 2, borderColor: '#f97316', marginBottom: 20, shadowColor: '#f97316', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6 },
  orderLabel: { fontSize: 14, color: '#888', fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  orderNumber: { fontSize: 56, fontWeight: '900', color: '#f97316', letterSpacing: 4 },
  waitCard: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#141414', borderRadius: 16, padding: 16, width: '100%', marginBottom: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  waitIcon: { fontSize: 32 },
  waitTitle: { fontSize: 13, color: '#666', marginBottom: 2 },
  waitTime: { fontSize: 20, fontWeight: '700', color: '#fff' },
  pointsCard: { backgroundColor: 'rgba(249,115,22,0.08)', borderRadius: 14, padding: 14, width: '100%', borderWidth: 1, borderColor: 'rgba(249,115,22,0.25)', marginBottom: 16, alignItems: 'center' },
  pointsText: { fontSize: 15, color: '#ccc', marginBottom: 4, textAlign: 'center' },
  pointsHighlight: { color: '#f97316', fontWeight: '800' },
  pointsBalance: { fontSize: 13, color: '#888' },
  qrPlaceholder: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: '#2a2a2a' },
  qrText: { fontSize: 28, color: '#444', marginBottom: 4 },
  qrSub: { fontSize: 12, color: '#555' },
  countdown: { fontSize: 14, color: '#555', marginBottom: 16 },
  newOrderButton: { backgroundColor: '#1e1e1e', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, borderWidth: 1, borderColor: '#333' },
  newOrderText: { fontSize: 16, fontWeight: '600', color: '#888' },
});
