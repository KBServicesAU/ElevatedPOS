import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useDeviceStore } from '../store/device';
import { useAuthStore, type AuthEmployee } from '../store/auth';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const PIN_LENGTH = 4;
const AUTH_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? '';

const AVATAR_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#3b82f6',
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function getAvatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length]!;
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function EmployeeLoginScreen() {
  const router = useRouter();
  const { identity } = useDeviceStore();
  const {
    employees,
    employee: loggedInEmployee,
    loading,
    error,
    fetchEmployees,
    pinLogin,
    quickPinLogin,
    logout,
    clearError,
  } = useAuthStore();

  const [selectedEmployee, setSelectedEmployee] = useState<AuthEmployee | null>(null);
  const [pin, setPin] = useState('');
  const [clockingIn, setClockingIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // If already logged in, allow continuing to POS
  useEffect(() => {
    // Try to fetch employee list for card-select
    fetchEmployees();
  }, []);

  // ── PIN pad handlers ─────────────────────────────────────────────
  function handleDigit(digit: string) {
    if (pin.length < PIN_LENGTH) {
      setPin((p) => p + digit);
      clearError();
      setMessage(null);
    }
  }

  function handleBackspace() {
    setPin((p) => p.slice(0, -1));
    clearError();
    setMessage(null);
  }

  function handleClear() {
    setPin('');
    clearError();
    setMessage(null);
  }

  // ── Actions ──────────────────────────────────────────────────────

  /** Clock in only — employee doesn't need to use the POS */
  async function handleClockIn() {
    if (pin.length < PIN_LENGTH) return;
    setClockingIn(true);
    try {
      // Authenticate
      if (selectedEmployee) {
        await pinLogin(selectedEmployee.id, pin);
      } else {
        await quickPinLogin(pin);
      }

      // Now clock in using the employee token
      const authState = useAuthStore.getState();
      const token = authState.employeeToken;
      const employee = authState.employee;

      if (!token || !employee) {
        setMessage('Login succeeded but token missing — try again');
        setPin('');
        return;
      }

      // Resolve a usable locationId. Prefer the device's paired location,
      // but fall back to the employee's first assigned location so clock-in
      // still works on devices that were paired without a specific location.
      const resolvedLocationId =
        identity?.locationId ||
        (employee.locationIds && employee.locationIds.length > 0
          ? employee.locationIds[0]
          : undefined);

      if (!resolvedLocationId) {
        setMessage('No location assigned — please pair the device or assign a location.');
        setPin('');
        setSelectedEmployee(null);
        logout();
        return;
      }

      // Only send registerId if it looks like a real UUID — empty strings or
      // non-UUID values would fail server-side validation.
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const registerId =
        identity?.registerId && UUID_RE.test(identity.registerId)
          ? identity.registerId
          : undefined;

      try {
        const res = await fetch(`${AUTH_BASE}/api/v1/time-clock/clock-in`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            locationId: resolvedLocationId,
            ...(registerId ? { registerId } : {}),
          }),
        });

        if (res.ok) {
          const name = `${employee.firstName} ${employee.lastName}`;
          setMessage(`${name} clocked in successfully`);
        } else if (res.status === 409) {
          setMessage('Already clocked in');
        } else {
          const err = (await res.json().catch(() => ({}))) as {
            title?: string;
            detail?: string;
            status?: number;
          };
          const detail = err.detail ? ` (${err.detail.slice(0, 80)})` : '';
          setMessage(`${err.title ?? `Clock in failed (${res.status})`}${detail}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Network error';
        setMessage(`Clock in failed — ${msg}`);
      }

      // Reset for next employee
      setPin('');
      setSelectedEmployee(null);
      logout();
    } catch {
      // pinLogin / quickPinLogin already set the auth-store error which the
      // banner picks up; just clear the PIN entry box.
      setPin('');
    } finally {
      setClockingIn(false);
    }
  }

  /** Login and open POS */
  async function handleLoginToPOS() {
    if (pin.length < PIN_LENGTH) return;
    try {
      if (selectedEmployee) {
        await pinLogin(selectedEmployee.id, pin);
      } else {
        await quickPinLogin(pin);
      }

      // Navigate to the appropriate role screen
      const role = identity?.role ?? 'pos';
      if (role === 'dashboard') {
        router.replace('/(dashboard)');
      } else {
        router.replace('/(pos)');
      }
    } catch {
      setPin('');
    }
  }

  /** If already logged in from previous login, continue to POS */
  function handleContinue() {
    const role = identity?.role ?? 'pos';
    if (role === 'dashboard') {
      router.replace('/(dashboard)');
    } else {
      router.replace('/(pos)');
    }
  }

  // ── Render ───────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.container}>
      <View style={s.inner}>
        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={s.logo}>ElevatedPOS</Text>
          <Text style={s.subtitle}>Employee Login</Text>
        </View>

        {/* ── Success message ── */}
        {message && (
          <View style={s.messageBanner}>
            <Ionicons
              name={message.includes('success') ? 'checkmark-circle' : 'information-circle'}
              size={18}
              color={message.includes('success') || message.includes('Already') ? '#22c55e' : '#f59e0b'}
            />
            <Text style={s.messageText}>{message}</Text>
          </View>
        )}

        {/* ── Already logged in banner ── */}
        {loggedInEmployee && (
          <TouchableOpacity style={s.continueBanner} onPress={handleContinue}>
            <View style={{ flex: 1 }}>
              <Text style={s.continueText}>
                Continue as {loggedInEmployee.firstName} {loggedInEmployee.lastName}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color="#6366f1" />
          </TouchableOpacity>
        )}

        {/* ── Employee cards ── */}
        {employees.length > 0 && (
          <View style={s.employeeSection}>
            <Text style={s.sectionLabel}>Select your profile</Text>
            <FlatList
              data={employees}
              keyExtractor={(e) => e.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.employeeList}
              renderItem={({ item, index }) => {
                const isSelected = selectedEmployee?.id === item.id;
                const color = getAvatarColor(index);
                return (
                  <TouchableOpacity
                    style={[
                      s.employeeCard,
                      isSelected && { borderColor: color, backgroundColor: `${color}15` },
                    ]}
                    onPress={() => {
                      setSelectedEmployee(isSelected ? null : item);
                      setPin('');
                      clearError();
                      setMessage(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[s.avatar, { backgroundColor: `${color}25`, borderColor: color }]}>
                      <Text style={[s.avatarText, { color }]}>
                        {getInitials(item.firstName, item.lastName)}
                      </Text>
                    </View>
                    <Text style={s.employeeName} numberOfLines={1}>
                      {item.firstName}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}

        {/* ── PIN entry ── */}
        <View style={s.pinSection}>
          <Text style={s.pinLabel}>
            {selectedEmployee
              ? `Enter PIN for ${selectedEmployee.firstName}`
              : 'Enter your PIN'}
          </Text>

          {/* PIN dots */}
          <View style={s.pinDots}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[s.dot, i < pin.length && s.dotFilled]}
              />
            ))}
          </View>

          {/* Error */}
          {error && <Text style={s.errorText}>{error}</Text>}

          {/* Numpad */}
          <View style={s.numpad}>
            {[
              ['1', '2', '3'],
              ['4', '5', '6'],
              ['7', '8', '9'],
              ['clear', '0', 'back'],
            ].map((row, ri) => (
              <View key={ri} style={s.numpadRow}>
                {row.map((key) => {
                  if (key === 'clear') {
                    return (
                      <TouchableOpacity
                        key={key}
                        style={s.numKey}
                        onPress={handleClear}
                        activeOpacity={0.6}
                      >
                        <Text style={s.numKeyTextSm}>CLR</Text>
                      </TouchableOpacity>
                    );
                  }
                  if (key === 'back') {
                    return (
                      <TouchableOpacity
                        key={key}
                        style={s.numKey}
                        onPress={handleBackspace}
                        activeOpacity={0.6}
                      >
                        <Ionicons name="backspace-outline" size={22} color="#ccc" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={key}
                      style={s.numKey}
                      onPress={() => handleDigit(key)}
                      activeOpacity={0.6}
                    >
                      <Text style={s.numKeyText}>{key}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        {/* ── Action buttons ── */}
        <View style={s.actions}>
          <TouchableOpacity
            style={[s.clockInBtn, pin.length < PIN_LENGTH && s.btnDisabled]}
            onPress={handleClockIn}
            disabled={pin.length < PIN_LENGTH || loading || clockingIn}
            activeOpacity={0.85}
          >
            {clockingIn || loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="time-outline" size={18} color="#fff" />
                <Text style={s.clockInBtnText}>Clock In</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.loginBtn, pin.length < PIN_LENGTH && s.btnDisabled]}
            onPress={handleLoginToPOS}
            disabled={pin.length < PIN_LENGTH || loading || clockingIn}
            activeOpacity={0.85}
          >
            {loading && !clockingIn ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={18} color="#fff" />
                <Text style={s.loginBtnText}>Start POS</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  inner: { flex: 1, paddingHorizontal: 32 },

  /* ── Header ── */
  header: { alignItems: 'center', marginTop: 32, marginBottom: 16 },
  logo: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  subtitle: { fontSize: 15, color: '#666', marginTop: 4, fontWeight: '500' },

  /* ── Message banner ── */
  messageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 12,
    alignSelf: 'center',
  },
  messageText: { fontSize: 14, color: '#22c55e', fontWeight: '600' },

  /* ── Continue banner ── */
  continueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99,102,241,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.25)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    alignSelf: 'center',
    maxWidth: 400,
    width: '100%',
  },
  continueText: { fontSize: 14, color: '#6366f1', fontWeight: '600' },

  /* ── Employee cards ── */
  employeeSection: { marginBottom: 16 },
  sectionLabel: { fontSize: 13, color: '#666', fontWeight: '600', marginBottom: 10, textAlign: 'center' },
  employeeList: { paddingHorizontal: 8, gap: 10, justifyContent: 'center' },
  employeeCard: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#2a2a3a',
    backgroundColor: '#141425',
    minWidth: 80,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginBottom: 6,
  },
  avatarText: { fontSize: 16, fontWeight: '800' },
  employeeName: { fontSize: 12, color: '#ccc', fontWeight: '600', maxWidth: 70, textAlign: 'center' },

  /* ── PIN section ── */
  pinSection: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  pinLabel: { fontSize: 15, color: '#888', fontWeight: '600', marginBottom: 16 },
  pinDots: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#2a2a3a',
    backgroundColor: 'transparent',
  },
  dotFilled: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  errorText: { fontSize: 13, color: '#ef4444', marginTop: 6, marginBottom: 4 },

  /* ── Numpad ── */
  numpad: { marginTop: 20, gap: 10 },
  numpadRow: { flexDirection: 'row', justifyContent: 'center', gap: 14 },
  numKey: {
    width: 70,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#141425',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numKeyText: { fontSize: 24, fontWeight: '700', color: '#fff' },
  numKeyTextSm: { fontSize: 14, fontWeight: '700', color: '#666' },

  /* ── Actions ── */
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 24,
    paddingTop: 16,
  },
  clockInBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#22c55e',
    borderRadius: 14,
    paddingVertical: 16,
  },
  clockInBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  loginBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingVertical: 16,
  },
  loginBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  btnDisabled: { opacity: 0.35 },
});
