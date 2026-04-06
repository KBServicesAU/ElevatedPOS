import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/auth';

const AUTH_API = process.env.EXPO_PUBLIC_AUTH_API_URL ?? 'http://localhost:4001';

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDigit = (digit: string) => {
    if (pin.length >= 6) return;
    setPin((p) => p + digit);
  };

  const handleDelete = () => setPin((p) => p.slice(0, -1));

  const handleLogin = async () => {
    if (pin.length < 4) {
      Alert.alert('Invalid PIN', 'Please enter your 4–6 digit PIN.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${AUTH_API}/api/v1/auth/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert('Login Failed', err?.detail ?? 'Incorrect PIN. Please try again.');
        setPin('');
        return;
      }

      const { data } = await res.json();
      login(
        {
          id: data.employee.id,
          name: data.employee.name,
          role: data.employee.role,
          orgId: data.employee.orgId,
        },
        data.accessToken,
      );
      router.replace('/(tabs)');
    } catch {
      // Auth service unavailable — fall back to demo login
      Alert.alert(
        'Offline Mode',
        'Could not reach the authentication server. Logging in with demo credentials.',
      );
      login(
        { id: 'demo', name: 'Demo Staff', role: 'cashier', orgId: 'demo-org' },
        'demo-token',
      );
      router.replace('/(tabs)');
    } finally {
      setLoading(false);
    }
  };

  const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Logo / title */}
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Ionicons name="storefront" size={32} color="#818cf8" />
          </View>
          <Text style={styles.appName}>ElevatedPOS</Text>
          <Text style={styles.subtitle}>Enter your PIN to continue</Text>
        </View>

        {/* PIN dots */}
        <View style={styles.pinRow}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.pinDot,
                i < pin.length && styles.pinDotFilled,
                i < 4 ? styles.pinDotRequired : styles.pinDotOptional,
              ]}
            />
          ))}
        </View>

        {/* Numpad */}
        <View style={styles.numpad}>
          {DIGITS.map((digit, idx) => {
            if (digit === '') return <View key={idx} style={styles.digitEmpty} />;
            if (digit === '⌫') {
              return (
                <TouchableOpacity key={idx} style={styles.digitBtn} onPress={handleDelete}>
                  <Ionicons name="backspace-outline" size={22} color="#9ca3af" />
                </TouchableOpacity>
              );
            }
            return (
              <TouchableOpacity
                key={idx}
                style={styles.digitBtn}
                onPress={() => handleDigit(digit)}
                activeOpacity={0.7}
              >
                <Text style={styles.digitText}>{digit}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Login button */}
        <TouchableOpacity
          style={[styles.loginBtn, (pin.length < 4 || loading) && styles.loginBtnDisabled]}
          onPress={handleLogin}
          disabled={pin.length < 4 || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.loginBtnText}>Unlock</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footer}>Terminal 1 · Main Location</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e2e' },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 24 },

  header: { alignItems: 'center', gap: 8 },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#2a2a3a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  appName: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  subtitle: { color: '#6b7280', fontSize: 14 },

  pinRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 8,
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  pinDotRequired: { borderColor: '#818cf8' },
  pinDotOptional: { borderColor: '#374151' },
  pinDotFilled: { backgroundColor: '#818cf8', borderColor: '#818cf8' },

  numpad: {
    width: '100%',
    maxWidth: 280,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  digitBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#2a2a3a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitEmpty: { width: 72, height: 72 },
  digitText: { color: '#fff', fontSize: 22, fontWeight: '600' },

  loginBtn: {
    width: '100%',
    maxWidth: 280,
    backgroundColor: '#818cf8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  loginBtnDisabled: { opacity: 0.4 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  footer: { color: '#374151', fontSize: 12 },
});
