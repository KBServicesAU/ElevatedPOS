import React, { useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { pairDevice } from '../lib/pairing';
import { useDeviceStore } from '../store/device';

const ROLE_LOCK = process.env['EXPO_PUBLIC_ROLE_LOCK'] as 'pos' | 'kds' | 'kiosk' | undefined;

const CODE_LENGTH = 6;

export default function PairScreen() {
  const router = useRouter();
  const { setIdentity } = useDeviceStore();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<(TextInput | null)[]>([]);
  const code = digits.join('');
  const isComplete = digits.every((d) => d.length === 1);

  function handleChange(value: string, index: number) {
    const char = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-1);
    const next = [...digits]; next[index] = char; setDigits(next); setError(null);
    if (char && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  }

  function handleKeyPress(key: string, index: number) {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits]; next[index - 1] = ''; setDigits(next);
      inputs.current[index - 1]?.focus();
    }
  }

  async function handlePair() {
    if (!isComplete || loading) return;
    setLoading(true); setError(null);
    try {
      const result = await pairDevice({ code, platform: Platform.OS, appVersion: '1.0.0' });
      await setIdentity({ ...result });
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pairing failed');
      setDigits(Array(CODE_LENGTH).fill(''));
      inputs.current[0]?.focus();
    } finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.logo}>NEXUS</Text>
        {ROLE_LOCK && (
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{ROLE_LOCK.toUpperCase()} DEVICE</Text>
          </View>
        )}
        <Text style={styles.title}>Pair This Device</Text>
        <Text style={styles.subtitle}>{'Generate a pairing code in the back-office under\n'}
          <Text style={styles.highlight}>Devices {'→'} Generate Code</Text>
        </Text>
        <View style={styles.codeRow}>
          {digits.map((digit, i) => (
            <TextInput
              key={i} ref={(r) => { inputs.current[i] = r; }}
              style={[styles.digitInput, digit ? styles.digitFilled : null, error ? styles.digitError : null]}
              value={digit} onChangeText={(v) => handleChange(v, i)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
              maxLength={1} autoCapitalize="characters" autoCorrect={false}
              returnKeyType={i === CODE_LENGTH - 1 ? 'done' : 'next'}
              onSubmitEditing={i === CODE_LENGTH - 1 ? handlePair : undefined}
              selectTextOnFocus autoFocus={i === 0}
            />
          ))}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity style={[styles.btn, (!isComplete || loading) && styles.btnDisabled]}
          onPress={handlePair} disabled={!isComplete || loading} activeOpacity={0.85}>
          {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>Pair Device</Text>}
        </TouchableOpacity>
        <Text style={styles.footer}>Codes expire after 15 minutes · Single use only</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 440, backgroundColor: '#141414', borderRadius: 24, padding: 36, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  logo: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: 6, marginBottom: 28 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 36 },
  highlight: { color: '#6366f1', fontWeight: '600' },
  codeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  digitInput: { width: 52, height: 64, borderRadius: 12, backgroundColor: '#1e1e1e', borderWidth: 2, borderColor: '#333', color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'center' },
  digitFilled: { borderColor: '#6366f1', backgroundColor: '#1a1a2e' },
  digitError: { borderColor: '#ef4444', backgroundColor: '#1f1010' },
  error: { color: '#ef4444', fontSize: 14, textAlign: 'center', marginBottom: 16, fontWeight: '500' },
  btn: { width: '100%', height: 56, borderRadius: 14, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  footer: { marginTop: 24, fontSize: 12, color: '#444', textAlign: 'center', lineHeight: 18 },
  roleBadge: { backgroundColor: '#1e1e4a', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 20, borderWidth: 1, borderColor: '#6366f1' },
  roleBadgeText: { fontSize: 12, fontWeight: '800', color: '#818cf8', letterSpacing: 2 },
});
