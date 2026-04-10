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
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/auth';

const AUTH_API = process.env.EXPO_PUBLIC_AUTH_API_URL ?? 'http://localhost:4001';

// ─── Clock In / Out Modal ─────────────────────────────────────────────────────

function ClockModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [clockPin, setClockPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [shiftStatus, setShiftStatus] = useState<'unknown' | 'clocked_in' | 'clocked_out'>('unknown');
  const [resultMessage, setResultMessage] = useState('');

  const handleClockDigit = (d: string) => {
    if (clockPin.length >= 6) return;
    setClockPin((p) => p + d);
  };
  const handleClockDelete = () => setClockPin((p) => p.slice(0, -1));

  const reset = () => {
    setClockPin('');
    setShiftStatus('unknown');
    setResultMessage('');
  };

  const handleClockAction = async () => {
    if (clockPin.length < 4) {
      Alert.alert('Invalid PIN', 'Enter your 4–6 digit PIN.');
      return;
    }
    setBusy(true);
    setResultMessage('');
    try {
      // Step 1: authenticate via PIN to get a token
      const authRes = await fetch(`${AUTH_API}/api/v1/auth/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: clockPin }),
      });
      if (!authRes.ok) {
        const err = await authRes.json().catch(() => ({})) as { detail?: string };
        Alert.alert('Authentication Failed', err.detail ?? 'Incorrect PIN.');
        setClockPin('');
        setBusy(false);
        return;
      }
      const { data: authData } = await authRes.json() as {
        data: { accessToken: string; employee: { name: string } };
      };
      const token = authData.accessToken;
      const staffName = authData.employee.name ?? 'Staff';
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

      // Step 2: check current shift status
      let isClockedIn = false;
      try {
        const shiftRes = await fetch(`${AUTH_API}/api/v1/time-clock/shifts/current`, { headers });
        if (shiftRes.ok) {
          const shift = await shiftRes.json() as { clockedOutAt?: string | null };
          isClockedIn = !shift.clockedOutAt;
        }
      } catch {
        // Cannot determine — assume not clocked in
      }

      // Step 3: clock in or out
      if (isClockedIn) {
        const res = await fetch(`${AUTH_API}/api/v1/time-clock/clock-out`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ locationId: process.env.EXPO_PUBLIC_DEFAULT_LOCATION_ID ?? 'LOC_001' }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { title?: string };
          throw new Error(err.title ?? 'Clock out failed');
        }
        setShiftStatus('clocked_out');
        setResultMessage(`👋 ${staffName} clocked out. See you next time!`);
      } else {
        const res = await fetch(`${AUTH_API}/api/v1/time-clock/clock-in`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ locationId: process.env.EXPO_PUBLIC_DEFAULT_LOCATION_ID ?? 'LOC_001' }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { title?: string };
          throw new Error(err.title ?? 'Clock in failed');
        }
        setShiftStatus('clocked_in');
        setResultMessage(`✅ ${staffName} clocked in. Have a great shift!`);
      }
      setClockPin('');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Clock action failed');
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const CLOCK_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={clockStyles.overlay}>
        <View style={clockStyles.sheet}>
          {/* Header */}
          <View style={clockStyles.header}>
            <Ionicons name="time-outline" size={28} color="#818cf8" />
            <Text style={clockStyles.title}>Clock In / Out</Text>
            <TouchableOpacity onPress={handleClose} style={clockStyles.closeBtn}>
              <Ionicons name="close" size={22} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {resultMessage ? (
            /* Success state */
            <View style={clockStyles.resultArea}>
              <Text style={clockStyles.resultIcon}>
                {shiftStatus === 'clocked_in' ? '🟢' : '🔴'}
              </Text>
              <Text style={clockStyles.resultText}>{resultMessage}</Text>
              <TouchableOpacity style={clockStyles.doneBtn} onPress={handleClose}>
                <Text style={clockStyles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* PIN entry state */
            <>
              <Text style={clockStyles.instruction}>Enter your PIN to clock in or out</Text>

              {/* PIN dots */}
              <View style={clockStyles.pinRow}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      clockStyles.pinDot,
                      i < clockPin.length && clockStyles.pinDotFilled,
                    ]}
                  />
                ))}
              </View>

              {/* Numpad */}
              <View style={clockStyles.numpad}>
                {CLOCK_DIGITS.map((digit, idx) => {
                  if (digit === '') return <View key={idx} style={clockStyles.digitEmpty} />;
                  if (digit === '⌫') {
                    return (
                      <TouchableOpacity key={idx} style={clockStyles.digitBtn} onPress={handleClockDelete}>
                        <Ionicons name="backspace-outline" size={20} color="#9ca3af" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={clockStyles.digitBtn}
                      onPress={() => handleClockDigit(digit)}
                      activeOpacity={0.7}
                    >
                      <Text style={clockStyles.digitText}>{digit}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Submit */}
              <TouchableOpacity
                style={[clockStyles.submitBtn, (clockPin.length < 4 || busy) && clockStyles.submitBtnDisabled]}
                onPress={handleClockAction}
                disabled={clockPin.length < 4 || busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={clockStyles.submitBtnText}>Clock In / Out</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const clockStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1e1e2e',
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  title: { flex: 1, color: '#fff', fontSize: 20, fontWeight: 'bold' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2a2a3a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instruction: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginBottom: 16 },
  pinRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 20 },
  pinDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#818cf8',
  },
  pinDotFilled: { backgroundColor: '#818cf8' },
  numpad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 20,
  },
  digitBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2a2a3a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitEmpty: { width: 64, height: 64 },
  digitText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  submitBtn: {
    backgroundColor: '#818cf8',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  resultArea: { alignItems: 'center', gap: 16, paddingVertical: 20 },
  resultIcon: { fontSize: 48 },
  resultText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  doneBtn: {
    backgroundColor: '#2a2a3a',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  doneBtnText: { color: '#818cf8', fontSize: 15, fontWeight: '600' },
});

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [showClock, setShowClock] = useState(false);

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

        {/* Quick clock in/out without full login */}
        <TouchableOpacity
          style={styles.clockBtn}
          onPress={() => setShowClock(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="time-outline" size={18} color="#818cf8" />
          <Text style={styles.clockBtnText}>Clock In / Out</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>Terminal 1 · Main Location</Text>
      </KeyboardAvoidingView>

      <ClockModal visible={showClock} onClose={() => setShowClock(false)} />
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

  clockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    backgroundColor: '#2a2a3a',
  },
  clockBtnText: { color: '#818cf8', fontSize: 14, fontWeight: '600' },

  footer: { color: '#374151', fontSize: 12 },
});
