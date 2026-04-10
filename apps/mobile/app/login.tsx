import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/auth';
import { toast } from '../components/ui';

const AUTH_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) {
      toast.warning('Missing Fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${AUTH_BASE}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { title?: string; message?: string };
        throw new Error(err.title ?? err.message ?? 'Invalid credentials');
      }

      const data = await res.json();
      // Store the JWT for API calls
      useAuthStore.setState({
        employeeToken: data.accessToken ?? data.token,
        employee: data.employee ?? {
          id: data.user?.id ?? '',
          firstName: data.user?.firstName ?? '',
          lastName: data.user?.lastName ?? '',
          email: data.user?.email ?? email,
          roleId: '',
          locationIds: [],
        },
      });

      toast.success('Welcome', `Signed in as ${data.user?.firstName ?? email}`);
      router.replace('/(dashboard)');
    } catch (err) {
      toast.error('Login Failed', err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        style={s.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={s.header}>
          <Text style={s.logo}>ElevatedPOS</Text>
          <Text style={s.subtitle}>Dashboard Login</Text>
        </View>

        <View style={s.form}>
          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#555"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={[s.label, { marginTop: 16 }]}>Password</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor="#555"
            secureTextEntry
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity
            style={[s.btn, loading && s.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.btnText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a14' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  subtitle: { fontSize: 16, color: '#6366f1', marginTop: 8, fontWeight: '600' },
  form: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: '#888', marginBottom: 6 },
  input: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
  },
  btn: {
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 17, fontWeight: '800', color: '#fff' },
});
