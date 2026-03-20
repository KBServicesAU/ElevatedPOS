import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKioskStore } from '../store/kiosk';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
] as const;

export default function WelcomeScreen() {
  const router = useRouter();
  const setLanguage = useKioskStore((s) => s.setLanguage);
  const [selectedLang, setSelectedLang] = useState<'en' | 'zh'>('en');

  function handleStart() {
    setLanguage(selectedLang);
    router.push('/loyalty');
  }

  function handleLang(code: 'en' | 'zh') {
    setSelectedLang(code);
    setLanguage(code);
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Venue branding */}
      <View style={styles.brandArea}>
        <View style={styles.logoPlaceholder}>
          <Text style={styles.logoText}>🍽️</Text>
        </View>
        <Text style={styles.venueName}>NEXUS Restaurant</Text>
        <Text style={styles.tagline}>Order at your own pace</Text>
      </View>

      {/* Touch to start */}
      <TouchableOpacity style={styles.startButton} onPress={handleStart} activeOpacity={0.85}>
        <Text style={styles.startButtonText}>Touch to Order</Text>
        <Text style={styles.startButtonSub}>Toque para Pedir</Text>
      </TouchableOpacity>

      {/* Language selector */}
      <View style={styles.langRow}>
        {LANGUAGES.map((lang) => (
          <TouchableOpacity
            key={lang.code}
            style={[styles.langButton, selectedLang === lang.code && styles.langButtonActive]}
            onPress={() => handleLang(lang.code)}
          >
            <Text style={[styles.langText, selectedLang === lang.code && styles.langTextActive]}>
              {lang.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Accessibility */}
      <TouchableOpacity style={styles.accessibilityButton}>
        <Text style={styles.accessibilityIcon}>♿</Text>
        <Text style={styles.accessibilityText}>Accessibility</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  brandArea: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  logoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 24,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#333',
  },
  logoText: {
    fontSize: 56,
  },
  venueName: {
    fontSize: 36,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 18,
    color: '#888',
    marginTop: 8,
  },
  startButton: {
    backgroundColor: '#f97316',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 80,
    alignItems: 'center',
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
    marginBottom: 48,
  },
  startButtonText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  startButtonSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  langRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  langButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#444',
    backgroundColor: '#1a1a1a',
  },
  langButtonActive: {
    borderColor: '#f97316',
    backgroundColor: 'rgba(249,115,22,0.15)',
  },
  langText: {
    fontSize: 16,
    color: '#888',
  },
  langTextActive: {
    color: '#f97316',
    fontWeight: '600',
  },
  accessibilityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accessibilityIcon: {
    fontSize: 18,
    color: '#666',
  },
  accessibilityText: {
    fontSize: 14,
    color: '#666',
  },
});
