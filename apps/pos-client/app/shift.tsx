import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { posApiFetch } from '../lib/api';
import { useAuthStore } from '../store/auth';

interface ShiftResponse {
  id: string;
  employeeId: string;
  locationId: string;
  clockedInAt: string;
  clockedOutAt: string | null;
  breakStart: string | null;
  note?: string;
}

function formatDuration(startIso: string): string {
  const start = new Date(startIso).getTime();
  const elapsed = Math.floor((Date.now() - start) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function ShiftScreen() {
  const router = useRouter();
  const employee = useAuthStore((s) => s.employee);

  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [currentShift, setCurrentShift] = useState<ShiftResponse | null>(null);
  const [duration, setDuration] = useState('00:00:00');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void fetchCurrentShift();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (currentShift && !currentShift.clockedOutAt) {
      setDuration(formatDuration(currentShift.clockedInAt));
      intervalRef.current = setInterval(() => {
        setDuration(formatDuration(currentShift.clockedInAt));
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [currentShift]);

  async function fetchCurrentShift() {
    setLoading(true);
    try {
      const data = await posApiFetch<ShiftResponse>('/api/v1/time-clock/shifts/current');
      setCurrentShift(data);
    } catch {
      // 404 means not clocked in — treat as null shift
      setCurrentShift(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleClockIn() {
    if (!employee) {
      Alert.alert('Error', 'No employee session found.');
      return;
    }
    setActing(true);
    try {
      const data = await posApiFetch<ShiftResponse>('/api/v1/time-clock/clock-in', {
        method: 'POST',
        body: JSON.stringify({
          locationId: 'LOC_001',
          ...(pin ? { pin } : {}),
          ...(note ? { note } : {}),
        }),
      });
      setCurrentShift(data);
      setNote('');
      setPin('');
      Alert.alert('Clocked In', `Welcome, ${employee.name ?? 'Staff'}! Your shift has started.`);
    } catch (err) {
      Alert.alert('Clock In Failed', String(err));
    } finally {
      setActing(false);
    }
  }

  async function handleClockOut() {
    Alert.alert(
      'Clock Out',
      `End shift after ${duration}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clock Out',
          style: 'destructive',
          onPress: async () => {
            setActing(true);
            try {
              await posApiFetch('/api/v1/time-clock/clock-out', { method: 'POST' });
              setCurrentShift(null);
              Alert.alert('Clocked Out', 'Your shift has ended. Have a great day!');
            } catch (err) {
              Alert.alert('Clock Out Failed', String(err));
            } finally {
              setActing(false);
            }
          },
        },
      ]
    );
  }

  async function handleBreak() {
    if (!currentShift) return;
    const onBreak = !!currentShift.breakStart;
    Alert.alert(
      onBreak ? 'End Break' : 'Start Break',
      onBreak ? 'Resume your shift?' : 'Take a break now?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: onBreak ? 'End Break' : 'Start Break',
          onPress: async () => {
            setActing(true);
            try {
              const endpoint = onBreak
                ? '/api/v1/time-clock/break/end'
                : '/api/v1/time-clock/break/start';
              await posApiFetch(endpoint, { method: 'POST' });
              await fetchCurrentShift();
            } catch (err) {
              Alert.alert('Error', String(err));
            } finally {
              setActing(false);
            }
          },
        },
      ]
    );
  }

  const clockedInAt = currentShift
    ? new Date(currentShift.clockedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>{'← Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Time Clock</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#818cf8" size="large" />
          <Text style={styles.loadingText}>Checking shift status…</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Status card */}
          <View style={styles.statusCard}>
            <View style={[styles.statusDot, currentShift ? styles.statusDotIn : styles.statusDotOut]} />
            <View style={styles.statusInfo}>
              <Text style={styles.statusLabel}>
                {currentShift ? 'Currently On Shift' : 'Not Clocked In'}
              </Text>
              {currentShift && clockedInAt ? (
                <Text style={styles.statusSub}>Started at {clockedInAt}</Text>
              ) : null}
            </View>
            {currentShift ? (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{duration}</Text>
              </View>
            ) : null}
          </View>

          {/* Employee info */}
          {employee ? (
            <View style={styles.employeeCard}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {(employee.name ?? 'S')
                    .split(' ')
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase() ?? '')
                    .join('')}
                </Text>
              </View>
              <View>
                <Text style={styles.employeeName}>{employee.name ?? 'Staff'}</Text>
                <Text style={styles.employeeRole}>
                  {employee.role
                    ? employee.role.charAt(0).toUpperCase() + employee.role.slice(1)
                    : 'Employee'}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Clocked IN state */}
          {currentShift ? (
            <>
              <Text style={styles.sectionTitle}>Shift Controls</Text>
              <View style={styles.card}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnBreak, acting && styles.btnDisabled]}
                  onPress={() => void handleBreak()}
                  disabled={acting}
                >
                  {acting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.actionBtnText}>
                      {currentShift.breakStart ? 'End Break' : 'Start Break'}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnOut, acting && styles.btnDisabled]}
                  onPress={() => void handleClockOut()}
                  disabled={acting}
                >
                  <Text style={styles.actionBtnText}>Clock Out</Text>
                </TouchableOpacity>
              </View>

              {currentShift.breakStart ? (
                <View style={styles.breakBanner}>
                  <Text style={styles.breakBannerText}>
                    On break since{' '}
                    {new Date(currentShift.breakStart).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            /* Clocked OUT state */
            <>
              <Text style={styles.sectionTitle}>Clock In</Text>
              <View style={styles.card}>
                <View style={styles.inputBlock}>
                  <Text style={styles.inputLabel}>PIN (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={pin}
                    onChangeText={setPin}
                    placeholder="Enter PIN"
                    placeholderTextColor="#4b5563"
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={6}
                  />
                </View>
                <View style={styles.divider} />
                <View style={styles.inputBlock}>
                  <Text style={styles.inputLabel}>Note (optional)</Text>
                  <TextInput
                    style={[styles.input, styles.inputMultiline]}
                    value={note}
                    onChangeText={setNote}
                    placeholder="e.g. Opening shift"
                    placeholderTextColor="#4b5563"
                    multiline
                    numberOfLines={2}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.clockInBtn, acting && styles.btnDisabled]}
                onPress={() => void handleClockIn()}
                disabled={acting}
              >
                {acting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.clockInBtnText}>Clock In</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          <View style={styles.bottomPad} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e2e' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#16161f',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3a',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { minWidth: 60 },
  backText: { color: '#818cf8', fontSize: 15 },
  headerTitle: { color: '#e5e7eb', fontSize: 17, fontWeight: '700' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#6b7280', fontSize: 14 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  sectionTitle: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 4,
  },

  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16161f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    padding: 16,
    gap: 12,
    marginTop: 4,
  },
  statusDot: { width: 14, height: 14, borderRadius: 7 },
  statusDotIn: { backgroundColor: '#4ade80' },
  statusDotOut: { backgroundColor: '#f87171' },
  statusInfo: { flex: 1 },
  statusLabel: { color: '#e5e7eb', fontSize: 16, fontWeight: '600' },
  statusSub: { color: '#6b7280', fontSize: 13, marginTop: 2 },
  durationBadge: {
    backgroundColor: '#1e3a5f',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  durationText: { color: '#60a5fa', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },

  employeeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#16161f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    padding: 16,
    marginTop: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  employeeName: { color: '#e5e7eb', fontSize: 15, fontWeight: '600' },
  employeeRole: { color: '#6b7280', fontSize: 12, marginTop: 2 },

  card: {
    backgroundColor: '#16161f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: '#2a2a3a', marginLeft: 16 },

  actionBtn: {
    margin: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionBtnBreak: { backgroundColor: '#1d4ed8' },
  actionBtnOut: { backgroundColor: '#7f1d1d', marginTop: 0 },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  breakBanner: {
    marginTop: 12,
    backgroundColor: '#451a03',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#92400e',
  },
  breakBannerText: { color: '#fbbf24', fontSize: 14, fontWeight: '600' },

  inputBlock: { padding: 16 },
  inputLabel: { color: '#6b7280', fontSize: 12, marginBottom: 6, fontWeight: '600' },
  input: {
    color: '#e5e7eb',
    fontSize: 15,
    backgroundColor: '#2a2a3a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputMultiline: { minHeight: 60, textAlignVertical: 'top' },

  clockInBtn: {
    marginTop: 20,
    backgroundColor: '#4f46e5',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  clockInBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  bottomPad: { height: 32 },
});
