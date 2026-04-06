import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKioskStore } from '../store/kiosk';

const DIGIT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', '✓'] as const;

// TODO: Remove mock customers once loyalty lookup API (GET /api/v1/loyalty/accounts/lookup) is deployed
// Demo customers for phone lookup fallback
const MOCK_CUSTOMERS: Record<string, { name: string; points: number; tier: string }> = {
  '0412345678': { name: 'Alex Chen', points: 1240, tier: 'Gold' },
  '0400000000': { name: 'Sam Taylor', points: 380, tier: 'Silver' },
  '0411111111': { name: 'Jordan Lee', points: 4820, tier: 'Platinum' },
};

type InputMode = 'keypad' | 'camera';
type LookupResult = { name: string; points: number; tier: string } | 'not_found' | null;

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

const TIER_COLORS: Record<string, string> = {
  Bronze: '#cd7f32',
  Silver: '#c0c0c0',
  Gold: '#ffd700',
  Platinum: '#e5e4e2',
};

const TIER_ICONS: Record<string, string> = {
  Bronze: '🥉',
  Silver: '🥈',
  Gold: '🥇',
  Platinum: '💎',
};

export default function LoyaltyScreen() {
  const router = useRouter();
  const { loyaltyAccount, setLoyaltyAccount } = useKioskStore();

  const [mode, setMode] = useState<InputMode>('keypad');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [lookup, setLookup] = useState<LookupResult>(null);

  // Camera scan animation
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const scanBorderOpacity = useRef(new Animated.Value(1)).current;

  // Phone input field (text mode alternative)
  const [phoneText, setPhoneText] = useState('');

  useEffect(() => {
    // If already linked, pre-populate
    if (loyaltyAccount) {
      setPhone(loyaltyAccount.phone);
      setLookup({ name: loyaltyAccount.name, points: loyaltyAccount.points, tier: loyaltyAccount.tier });
    }
  }, []);

  // Run scan animation when camera mode is active
  useEffect(() => {
    if (mode !== 'camera') return;
    const scanLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const borderPulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scanBorderOpacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        Animated.timing(scanBorderOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    scanLoop.start();
    borderPulse.start();
    return () => {
      scanLoop.stop();
      borderPulse.stop();
    };
  }, [mode, scanLineAnim, scanBorderOpacity]);

  const scanLineTranslate = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 220],
  });

  // ── Lookup ──
  const doLookup = useCallback(
    async (phoneNumber: string) => {
      if (phoneNumber.length < 10) return;
      setLoading(true);
      setLookup(null);
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/loyalty/accounts/lookup?phone=${encodeURIComponent(phoneNumber)}`,
          { signal: (AbortSignal as unknown as { timeout(ms: number): AbortSignal }).timeout(4000) },
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.name) {
            const account = {
              name: data.name,
              points: data.points ?? 0,
              tier: data.tier ?? 'Bronze',
            };
            setLookup(account);
            setLoyaltyAccount({ phone: phoneNumber, ...account });
          } else {
            setLookup('not_found');
          }
        } else {
          // Fall through to mock
          throw new Error('not ok');
        }
      } catch {
        // API unavailable — fall back to mock data for demo/offline use
        const found = MOCK_CUSTOMERS[phoneNumber];
        if (found) {
          setLookup(found);
          setLoyaltyAccount({ phone: phoneNumber, ...found });
        } else {
          setLookup('not_found');
        }
      } finally {
        setLoading(false);
      }
    },
    [setLoyaltyAccount],
  );

  // ── Keypad handler ──
  function handleKey(key: string) {
    if (key === '←') {
      setPhone((p) => p.slice(0, -1));
      setLookup(null);
    } else if (key === '✓') {
      doLookup(phone);
    } else if (phone.length < 10) {
      const next = phone + key;
      setPhone(next);
      setLookup(null);
      if (next.length === 10) {
        doLookup(next);
      }
    }
  }

  // ── Camera mock: simulate QR scan after 3s ──
  const [scanning, setScanning] = useState(false);
  function handleStartScan() {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      // Mock: scan resolves to first demo customer
      const phoneNum = '0412345678';
      const found = MOCK_CUSTOMERS[phoneNum];
      setPhone(phoneNum);
      if (found) {
        setLookup(found);
        setLoyaltyAccount({ phone: phoneNum, name: found.name, points: found.points, tier: found.tier });
      } else {
        setLookup('not_found');
      }
    }, 3000);
  }

  function handleContinue() {
    router.push('/menu');
  }

  function handleSkip() {
    setLoyaltyAccount(null);
    router.push('/menu');
  }

  function handleChange() {
    setLoyaltyAccount(null);
    setLookup(null);
    setPhone('');
  }

  // ── Already linked view ──
  if (loyaltyAccount && lookup && lookup !== 'not_found') {
    const tierColor = TIER_COLORS[loyaltyAccount.tier] ?? '#888';
    const tierIcon = TIER_ICONS[loyaltyAccount.tier] ?? '⭐';
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Loyalty Rewards</Text>
        <Text style={styles.subtitle}>You're earning points on this order</Text>

        <View style={styles.linkedCard}>
          <View style={[styles.tierBadgeLarge, { backgroundColor: tierColor }]}>
            <Text style={styles.tierIconLarge}>{tierIcon}</Text>
            <Text style={styles.tierLabelLarge}>{loyaltyAccount.tier}</Text>
          </View>
          <Text style={styles.linkedName}>Earning points as</Text>
          <Text style={styles.linkedNameBig}>{loyaltyAccount.name}</Text>
          <View style={styles.pointsRow}>
            <Text style={styles.pointsNumber}>{loyaltyAccount.points.toLocaleString()}</Text>
            <Text style={styles.pointsLabel}> pts available</Text>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.changeBtn} onPress={handleChange}>
            <Text style={styles.changeBtnText}>Change Account</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleContinue}>
          <Text style={styles.primaryButtonText}>Continue to Menu →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip — Order as Guest</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Sign In for Rewards</Text>
      <Text style={styles.subtitle}>Scan your QR code or enter your mobile number</Text>

      {/* Mode toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'camera' && styles.modeBtnActive]}
          onPress={() => setMode('camera')}
        >
          <Text style={[styles.modeBtnText, mode === 'camera' && styles.modeBtnTextActive]}>
            📷  Scan QR Code
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'keypad' && styles.modeBtnActive]}
          onPress={() => setMode('keypad')}
        >
          <Text style={[styles.modeBtnText, mode === 'keypad' && styles.modeBtnTextActive]}>
            📱  Phone Number
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Camera Mode ── */}
      {mode === 'camera' && (
        <View style={styles.cameraArea}>
          <Animated.View style={[styles.scanBox, { opacity: scanBorderOpacity }]}>
            {/* Corner marks */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            {/* Animated scan line */}
            <Animated.View
              style={[
                styles.scanLine,
                { transform: [{ translateY: scanLineTranslate }] },
              ]}
            />
            {/* Mock camera placeholder */}
            <View style={styles.cameraPlaceholder}>
              {scanning ? (
                <>
                  <ActivityIndicator size="large" color="#22c55e" />
                  <Text style={styles.cameraPlaceholderText}>Scanning…</Text>
                </>
              ) : (
                <>
                  <Text style={styles.cameraIcon}>📷</Text>
                  <Text style={styles.cameraPlaceholderText}>Position QR code in frame</Text>
                </>
              )}
            </View>
          </Animated.View>

          {!scanning && (
            <TouchableOpacity style={styles.simulateScanBtn} onPress={handleStartScan}>
              <Text style={styles.simulateScanText}>Simulate QR Scan</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.cameraHint}>
            Open your ElevatedPOS loyalty app and show your QR code
          </Text>
        </View>
      )}

      {/* ── Keypad Mode ── */}
      {mode === 'keypad' && (
        <>
          {/* Phone display */}
          <View style={[styles.phoneDisplay, phone.length > 0 && styles.phoneDisplayActive]}>
            <Text style={styles.phoneText}>{phone || '0___ ___ ___'}</Text>
          </View>

          {/* Lookup result */}
          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#f59e0b" size="small" />
              <Text style={styles.loadingText}>Looking up account…</Text>
            </View>
          )}
          {lookup && lookup !== 'not_found' && !loading && (
            <View style={styles.foundCard}>
              <View style={[styles.tierBadge, { backgroundColor: TIER_COLORS[lookup.tier] ?? '#888' }]}>
                <Text style={styles.tierText}>
                  {TIER_ICONS[lookup.tier] ?? '⭐'} {lookup.tier}
                </Text>
              </View>
              <Text style={styles.foundName}>Welcome back, {lookup.name}!</Text>
              <Text style={styles.foundPoints}>
                {lookup.points.toLocaleString()} points available
              </Text>
            </View>
          )}
          {lookup === 'not_found' && !loading && (
            <View style={styles.notFoundCard}>
              <Text style={styles.notFoundEmoji}>👤</Text>
              <Text style={styles.notFoundText}>No account found. Continue as guest.</Text>
            </View>
          )}

          {/* Numeric keypad */}
          <View style={styles.keypad}>
            {DIGIT_KEYS.map((key) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.key,
                  key === '✓' && styles.keyConfirm,
                  key === '←' && styles.keyBack,
                ]}
                onPress={() => handleKey(key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.keyText, key === '✓' && styles.keyTextConfirm]}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* ── Actions ── */}
      <View style={styles.actions}>
        {lookup && lookup !== 'not_found' && !loading ? (
          <TouchableOpacity style={styles.primaryButton} onPress={handleContinue}>
            <Text style={styles.primaryButtonText}>Apply & Continue →</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip — Order as Guest</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 28,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 6,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  modeBtnActive: {
    backgroundColor: '#f59e0b',
  },
  modeBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  modeBtnTextActive: {
    color: '#000',
    fontWeight: '700',
  },

  // Camera
  cameraArea: {
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  scanBox: {
    width: 260,
    height: 260,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#22c55e',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#0a0a0a',
    marginBottom: 16,
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#22c55e',
    borderWidth: 3,
    zIndex: 2,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#22c55e',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    zIndex: 3,
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  cameraIcon: {
    fontSize: 48,
  },
  cameraPlaceholderText: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
  },
  simulateScanBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginBottom: 12,
  },
  simulateScanText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
  cameraHint: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Phone display
  phoneDisplay: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 40,
    marginBottom: 12,
    minWidth: 280,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333',
  },
  phoneDisplayActive: {
    borderColor: '#f59e0b',
  },
  phoneText: {
    fontSize: 30,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 4,
  },

  // Lookup states
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 15,
    color: '#666',
  },
  foundCard: {
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    marginBottom: 16,
    width: '100%',
  },
  tierBadge: {
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  tierText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000',
  },
  foundName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  foundPoints: {
    fontSize: 17,
    color: '#f59e0b',
    fontWeight: '600',
  },
  notFoundCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  notFoundEmoji: {
    fontSize: 24,
  },
  notFoundText: {
    color: '#888',
    fontSize: 15,
    flex: 1,
  },

  // Keypad
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 300,
    gap: 10,
    justifyContent: 'center',
    marginBottom: 20,
  },
  key: {
    width: 86,
    height: 72,
    backgroundColor: '#1e1e1e',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  keyConfirm: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  keyBack: {
    backgroundColor: '#2a2a2a',
  },
  keyText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
  },
  keyTextConfirm: {
    color: '#000',
    fontWeight: '800',
  },

  // Actions
  actions: {
    width: '100%',
    gap: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: '#f59e0b',
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 40,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
    minHeight: 64,
  },
  primaryButtonText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
  },
  skipButton: {
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: 'center',
  },
  skipText: {
    fontSize: 16,
    color: '#555',
    textDecorationLine: 'underline',
  },

  // Already linked card
  linkedCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 24,
  },
  tierBadgeLarge: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  tierIconLarge: {
    fontSize: 20,
  },
  tierLabelLarge: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000',
  },
  linkedName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  linkedNameBig: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 12,
  },
  pointsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  pointsNumber: {
    fontSize: 40,
    fontWeight: '900',
    color: '#f59e0b',
  },
  pointsLabel: {
    fontSize: 16,
    color: '#888',
    fontWeight: '500',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#2a2a2a',
    marginVertical: 20,
  },
  changeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  changeBtnText: {
    fontSize: 15,
    color: '#888',
    fontWeight: '600',
  },
});
