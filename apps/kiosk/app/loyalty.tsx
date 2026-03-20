import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKioskStore } from '../store/kiosk';

const DIGIT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', '✓'] as const;

const MOCK_CUSTOMERS: Record<string, { name: string; points: number; tier: string }> = {
  '0412345678': { name: 'Alex Chen', points: 1240, tier: 'Gold' },
  '0400000000': { name: 'Sam Taylor', points: 380, tier: 'Silver' },
};

export default function LoyaltyScreen() {
  const router = useRouter();
  const setLoyaltyAccount = useKioskStore((s) => s.setLoyaltyAccount);
  const [phone, setPhone] = useState('');
  const [lookup, setLookup] = useState<{ name: string; points: number; tier: string } | null | 'not_found'>(null);

  function handleKey(key: string) {
    if (key === '←') {
      setPhone((p) => p.slice(0, -1));
      setLookup(null);
    } else if (key === '✓') {
      const found = MOCK_CUSTOMERS[phone];
      if (found) {
        setLookup(found);
        setLoyaltyAccount({ phone, ...found });
      } else if (phone.length >= 10) {
        setLookup('not_found');
      }
    } else if (phone.length < 10) {
      setPhone((p) => p + key);
      setLookup(null);
    }
  }

  function handleContinue() {
    router.push('/menu');
  }

  function handleSkip() {
    setLoyaltyAccount(null);
    router.push('/menu');
  }

  const tierColors: Record<string, string> = {
    Bronze: '#cd7f32',
    Silver: '#c0c0c0',
    Gold: '#ffd700',
    Platinum: '#e5e4e2',
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Sign In for Rewards</Text>
      <Text style={styles.subtitle}>Enter your mobile number to earn & redeem points</Text>

      {/* Phone display */}
      <View style={styles.phoneDisplay}>
        <Text style={styles.phoneText}>{phone || '0___ ___ ___'}</Text>
      </View>

      {/* Lookup result */}
      {lookup && lookup !== 'not_found' && (
        <View style={styles.foundCard}>
          <View style={[styles.tierBadge, { backgroundColor: tierColors[lookup.tier] ?? '#888' }]}>
            <Text style={styles.tierText}>{lookup.tier}</Text>
          </View>
          <Text style={styles.foundName}>Welcome back, {lookup.name}!</Text>
          <Text style={styles.foundPoints}>{lookup.points.toLocaleString()} points available</Text>
        </View>
      )}
      {lookup === 'not_found' && (
        <View style={styles.notFoundCard}>
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

      {/* Actions */}
      <View style={styles.actions}>
        {lookup && lookup !== 'not_found' ? (
          <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
            <Text style={styles.continueButtonText}>Continue with Rewards →</Text>
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
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 32,
  },
  phoneDisplay: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 40,
    marginBottom: 16,
    minWidth: 280,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333',
  },
  phoneText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 4,
  },
  foundCard: {
    backgroundColor: 'rgba(249,115,22,0.1)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.3)',
    marginBottom: 16,
    width: '100%',
  },
  tierBadge: {
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  tierText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  foundName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  foundPoints: {
    fontSize: 15,
    color: '#f97316',
    fontWeight: '600',
  },
  notFoundCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
  notFoundText: {
    color: '#888',
    fontSize: 14,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 300,
    gap: 12,
    justifyContent: 'center',
    marginBottom: 24,
  },
  key: {
    width: 84,
    height: 64,
    backgroundColor: '#1e1e1e',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  keyConfirm: {
    backgroundColor: '#f97316',
    borderColor: '#f97316',
  },
  keyBack: {
    backgroundColor: '#2a2a2a',
  },
  keyText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#fff',
  },
  keyTextConfirm: {
    color: '#fff',
  },
  actions: {
    width: '100%',
    gap: 12,
    alignItems: 'center',
  },
  continueButton: {
    backgroundColor: '#f97316',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 40,
    width: '100%',
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  skipButton: {
    paddingVertical: 12,
  },
  skipText: {
    fontSize: 16,
    color: '#666',
    textDecorationLine: 'underline',
  },
});
