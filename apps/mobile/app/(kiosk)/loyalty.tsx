import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useKioskStore } from '../../store/kiosk';

const API_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4001';

const DIGIT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', '✓'] as const;

type InputMode = 'keypad' | 'camera';
type LookupResult =
  | { name: string; points: number; tier: string }
  | 'not_found'
  | null;

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

export default function KioskLoyaltyScreen() {
  const router = useRouter();
  const loyaltyAccount = useKioskStore((s) => s.loyaltyAccount);
  const setLoyaltyAccount = useKioskStore((s) => s.setLoyaltyAccount);

  const [mode, setMode] = useState<InputMode>('keypad');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [lookup, setLookup] = useState<LookupResult>(null);

  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const scanBorderOpacity = useRef(new Animated.Value(1)).current;

  // Pre-fill if already linked
  useEffect(() => {
    if (loyaltyAccount) {
      setPhone(loyaltyAccount.phone);
      setLookup({
        name: loyaltyAccount.name,
        points: loyaltyAccount.points,
        tier: loyaltyAccount.tier,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scan line pulse animation
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
        Animated.timing(scanBorderOpacity, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(scanBorderOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
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
    outputRange: [0, 240],
  });

  const doLookup = useCallback(
    async (phoneNumber: string) => {
      if (phoneNumber.length < 10) return;
      setLoading(true);
      setLookup(null);
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/loyalty/accounts/lookup?phone=${encodeURIComponent(phoneNumber)}`,
          { signal: AbortSignal.timeout(4000) },
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.name) {
            const account = {
              name: data.name,
              points: Number(data.points) || 0,
              tier: data.tier ?? 'Bronze',
            };
            setLookup(account);
            setLoyaltyAccount({ phone: phoneNumber, ...account });
          } else {
            setLookup('not_found');
          }
        } else {
          setLookup('not_found');
        }
      } catch {
        setLookup('not_found');
      } finally {
        setLoading(false);
      }
    },
    [setLoyaltyAccount],
  );

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

  // Camera barcode scanning is not yet available (expo-camera not installed).
  // The QR mode UI shows a placeholder until the camera module is added.

  function handleContinue() {
    router.push('/(kiosk)/menu');
  }

  function handleSkip() {
    setLoyaltyAccount(null);
    router.push('/(kiosk)/menu');
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
            <Text style={styles.pointsNumber}>
              {loyaltyAccount.points.toLocaleString()}
            </Text>
            <Text style={styles.pointsLabel}> pts available</Text>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.changeBtn}
            onPress={handleChange}
            activeOpacity={0.85}
          >
            <Text style={styles.changeBtnText}>Change Account</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleContinue}
          activeOpacity={0.9}
        >
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
      <Text style={styles.subtitle}>
        Scan your QR code or enter your mobile number
      </Text>

      {/* Mode toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'camera' && styles.modeBtnActive]}
          onPress={() => setMode('camera')}
          activeOpacity={0.85}
        >
          <Ionicons
            name="qr-code-outline"
            size={18}
            color={mode === 'camera' ? '#000' : '#666'}
          />
          <Text
            style={[styles.modeBtnText, mode === 'camera' && styles.modeBtnTextActive]}
          >
            Scan QR
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'keypad' && styles.modeBtnActive]}
          onPress={() => setMode('keypad')}
          activeOpacity={0.85}
        >
          <Ionicons
            name="keypad-outline"
            size={18}
            color={mode === 'keypad' ? '#000' : '#666'}
          />
          <Text
            style={[styles.modeBtnText, mode === 'keypad' && styles.modeBtnTextActive]}
          >
            Phone
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Camera Mode ── */}
      {mode === 'camera' && (
        <View style={styles.cameraArea}>
          <Animated.View style={[styles.scanBox, { opacity: scanBorderOpacity }]}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            <Animated.View
              style={[
                styles.scanLine,
                { transform: [{ translateY: scanLineTranslate }] },
              ]}
            />
            <View style={styles.cameraPlaceholder}>
              <Ionicons name="qr-code" size={48} color="#22c55e" />
              <Text style={styles.cameraPlaceholderText}>
                Position QR code in frame
              </Text>
            </View>
          </Animated.View>

          <Text style={styles.cameraHint}
            Open your ElevatedPOS loyalty app and show your QR code
          </Text>
        </View>
      )}

      {/* ── Keypad Mode ── */}
      {mode === 'keypad' && (
        <>
          <View
            style={[
              styles.phoneDisplay,
              phone.length > 0 && styles.phoneDisplayActive,
            ]}
          >
            <Text style={styles.phoneText}>
              {phone || '04__  ___  ___'}
            </Text>
          </View>

          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#f59e0b" size="small" />
              <Text style={styles.loadingText}>Looking up account…</Text>
            </View>
          )}

          {lookup && lookup !== 'not_found' && !loading && (
            <View style={styles.foundCard}>
              <View
                style={[
                  styles.tierBadge,
                  { backgroundColor: TIER_COLORS[lookup.tier] ?? '#888' },
                ]}
              >
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
              <Ionicons name="person-outline" size={22} color="#888" />
              <Text style={styles.notFoundText}>
                No account found. Continue as guest.
              </Text>
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
                {key === '✓' ? (
                  <Ionicons name="checkmark" size={28} color="#000" />
                ) : key === '←' ? (
                  <Ionicons name="backspace-outline" size={24} color="#fff" />
                ) : (
                  <Text style={styles.keyText}>{key}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* ── Actions ── */}
      <View style={styles.actions}>
        {lookup && lookup !== 'not_found' && !loading ? (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleContinue}
            activeOpacity={0.9}
          >
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
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
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
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  modeBtnActive: { backgroundColor: '#f59e0b' },
  modeBtnText: { fontSize: 15, fontWeight: '700', color: '#666' },
  modeBtnTextActive: { color: '#000', fontWeight: '800' },

  cameraArea: { alignItems: 'center', width: '100%', marginBottom: 16 },
  scanBox: {
    width: 280,
    height: 280,
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
    width: 28,
    height: 28,
    borderColor: '#22c55e',
    borderWidth: 3,
    zIndex: 2,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 6,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 6,
  },
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
  cameraPlaceholderText: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
  },
  simulateScanBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginBottom: 12,
  },
  simulateScanText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000',
  },
  cameraHint: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    lineHeight: 18,
  },

  phoneDisplay: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 40,
    marginBottom: 14,
    minWidth: 300,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333',
  },
  phoneDisplayActive: { borderColor: '#f59e0b' },
  phoneText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  loadingText: { fontSize: 15, color: '#666' },

  foundCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
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
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  foundPoints: {
    fontSize: 17,
    color: '#f59e0b',
    fontWeight: '700',
  },

  notFoundCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  notFoundText: { color: '#888', fontSize: 15, flex: 1 },

  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 316,
    gap: 10,
    justifyContent: 'center',
    marginBottom: 20,
  },
  key: {
    width: 92,
    height: 76,
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
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
  },

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
    fontWeight: '900',
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
  tierIconLarge: { fontSize: 20 },
  tierLabelLarge: {
    fontSize: 16,
    fontWeight: '900',
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
    fontWeight: '600',
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
    fontWeight: '700',
  },
});
