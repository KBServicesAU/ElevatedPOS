import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  AppStateStatus,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useKioskStore } from '../../store/kiosk';
import { useDeviceSettings } from '../../store/device-settings';

const IDLE_TIMEOUT_MS = 90_000;

const PROMOS = [
  { id: '1', headline: 'Fresh Daily Specials', sub: 'Made from scratch every morning' },
  { id: '2', headline: 'Earn Loyalty Points', sub: 'Every dollar spent earns rewards' },
  { id: '3', headline: 'Order Your Way', sub: 'Dine in or take away — your choice' },
  { id: '4', headline: 'Barramundi Fishcake', sub: "Chef's Special — $24.00" },
  { id: '5', headline: 'Happy Hour Drinks', sub: '3–5 PM daily — $5 selected beverages' },
];

const GRADIENT_CYCLES = [
  { base: '#0d0820', overlay: '#c2410c' },
  { base: '#07130d', overlay: '#15803d' },
  { base: '#0a0e1a', overlay: '#1d4ed8' },
  { base: '#120a00', overlay: '#b45309' },
];

const LANG_LABELS: Record<string, { label: string; tapText: string; tapSub: string }> = {
  en: { label: 'EN', tapText: 'TAP TO START', tapSub: 'Touch anywhere to begin' },
  zh: { label: '中文', tapText: '触摸开始', tapSub: '点击任意位置开始' },
  ar: { label: 'عربي', tapText: 'انقر للبدء', tapSub: 'المس أي مكان للبدء' },
};

export default function AttractScreen() {
  const router = useRouter();
  const { resetOrder, language, setLanguage, setOrderType } = useKioskStore();
  // v2.7.44 — only hospitality merchants see the Eat-In/Takeaway prompt.
  // Retail / pharmacy / services kiosks skip straight to the menu and
  // the order is tagged 'retail' for the rest of the flow.
  const deviceIndustry = useDeviceSettings((s) => s.config?.identity?.industry);
  const isHospitality = deviceIndustry === 'hospitality';

  const [gradientIndex, setGradientIndex] = useState(0);
  const gradientAnim = useRef(new Animated.Value(0)).current;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  const [promoIndex, setPromoIndex] = useState(0);
  const promoFade = useRef(new Animated.Value(1)).current;

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundTimestamp = useRef<number | null>(null);

  const resetIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      resetOrder();
      router.replace('/(kiosk)/attract');
    }, IDLE_TIMEOUT_MS);
  }, [resetOrder, router]);

  const startAnimations = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(gradientAnim, { toValue: 1, duration: 4000, useNativeDriver: false }),
        Animated.timing(gradientAnim, { toValue: 0, duration: 4000, useNativeDriver: false }),
      ]),
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.15, duration: 1000, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
        ]),
      ]),
    ).start();
  }, [gradientAnim, pulseAnim, pulseOpacity]);

  useEffect(() => {
    startAnimations();
    resetIdleTimer();

    function handleAppStateChange(nextState: AppStateStatus) {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundTimestamp.current = Date.now();
      } else if (nextState === 'active') {
        if (backgroundTimestamp.current !== null) {
          const elapsed = Date.now() - backgroundTimestamp.current;
          backgroundTimestamp.current = null;
          if (elapsed >= IDLE_TIMEOUT_MS) {
            resetOrder();
            router.replace('/(kiosk)/attract');
            return;
          }
        }
        resetIdleTimer();
      }
    }

    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      appStateSub.remove();
    };
  }, [startAnimations, resetIdleTimer, resetOrder, router]);

  useEffect(() => {
    const interval = setInterval(() => {
      setGradientIndex((i) => (i + 1) % GRADIENT_CYCLES.length);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(promoFade, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
        setPromoIndex((i) => (i + 1) % PROMOS.length);
        Animated.timing(promoFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      });
    }, 3500);
    return () => clearInterval(interval);
  }, [promoFade]);

  function handleTap() {
    resetOrder();
    resetIdleTimer();
    // v2.7.44 — non-hospitality kiosks skip the Eat-In / Takeaway prompt
    // entirely and go straight to the menu. We pre-tag the cart as
    // 'retail' so the eventual /api/v1/orders POST sends the right
    // orderType. resetOrder() defaulted us to 'dine_in' so we have to
    // override here AFTER the reset.
    if (!isHospitality) {
      setOrderType('retail');
      router.push('/(kiosk)/menu');
      return;
    }
    router.push('/(kiosk)/order-type');
  }

  function handleLangChange(lang: 'en' | 'zh' | 'ar') {
    setLanguage(lang);
    resetIdleTimer();
  }

  const currentGradient = GRADIENT_CYCLES[gradientIndex];
  const overlayOpacity = gradientAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.55],
  });

  const currentPromo = PROMOS[promoIndex];
  const langConfig = LANG_LABELS[language] ?? LANG_LABELS['en'];

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handleTap}
      activeOpacity={1}
    >
      <View style={[styles.gradientBase, { backgroundColor: currentGradient.base }]} />

      <Animated.View
        style={[
          styles.gradientOverlay,
          { opacity: overlayOpacity, backgroundColor: currentGradient.overlay },
        ]}
      />

      <View style={[styles.decorCircle, styles.decorCircle1]} />
      <View style={[styles.decorCircle, styles.decorCircle2]} />
      <View style={[styles.decorCircle, styles.decorCircle3]} />

      <View style={styles.langSelector}>
        {(['en', 'zh', 'ar'] as const).map((lang) => (
          <TouchableOpacity
            key={lang}
            style={[styles.langBtn, language === lang && styles.langBtnActive]}
            onPress={(e) => {
              e.stopPropagation();
              handleLangChange(lang);
            }}
          >
            <Text style={[styles.langBtnText, language === lang && styles.langBtnTextActive]}>
              {LANG_LABELS[lang].label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.content}>
        <View style={styles.brandArea}>
          <View style={styles.logoRing}>
            <Text style={styles.logoEmoji}>🍽️</Text>
          </View>
          <Text style={styles.businessName}>ElevatedPOS Restaurant</Text>
          <Text style={styles.businessTagline}>Powered by ElevatedPOS</Text>
        </View>

        <Animated.View style={[styles.promoCard, { opacity: promoFade }]}>
          <Text style={styles.promoHeadline}>{currentPromo.headline}</Text>
          <Text style={styles.promoSub}>{currentPromo.sub}</Text>
        </Animated.View>

        <View style={styles.tapArea}>
          <Animated.View
            style={[
              styles.pulseRing,
              {
                transform: [{ scale: pulseAnim }],
                opacity: pulseOpacity,
              },
            ]}
          />
          <View style={styles.tapButton}>
            <Text style={styles.tapIcon}>👆</Text>
            <Text style={styles.tapText}>{langConfig.tapText}</Text>
            <Text style={styles.tapSub}>{langConfig.tapSub}</Text>
          </View>
        </View>

        <View style={styles.dotsRow}>
          {PROMOS.map((_, i) => (
            <View key={i} style={[styles.dot, i === promoIndex && styles.dotActive]} />
          ))}
        </View>

        <Text style={styles.footer}>Available 7 days · 7:00 AM – 10:00 PM</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradientBase: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  decorCircle: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.12)',
  },
  decorCircle1: {
    width: 600,
    height: 600,
    top: -200,
    left: -200,
    backgroundColor: 'rgba(88,28,220,0.08)',
  },
  decorCircle2: {
    width: 400,
    height: 400,
    bottom: -100,
    right: -100,
    backgroundColor: 'rgba(249,115,22,0.06)',
  },
  decorCircle3: {
    width: 250,
    height: 250,
    top: '28%',
    right: -80,
    backgroundColor: 'rgba(139,92,246,0.08)',
  },
  langSelector: {
    position: 'absolute',
    top: 48,
    right: 24,
    flexDirection: 'row',
    gap: 8,
    zIndex: 10,
  },
  langBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    minHeight: 36,
    justifyContent: 'center',
  },
  langBtnActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  langBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  langBtnTextActive: {
    color: '#000',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  brandArea: {
    alignItems: 'center',
  },
  logoRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(249,115,22,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoEmoji: {
    fontSize: 54,
  },
  businessName: {
    fontSize: 40,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  businessTagline: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 6,
    letterSpacing: 1,
  },
  promoCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    minWidth: 320,
  },
  promoHeadline: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 6,
  },
  promoSub: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
  },
  tapArea: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 240,
    height: 240,
  },
  pulseRing: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 3,
    borderColor: '#f97316',
  },
  tapButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 20,
  },
  tapIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  tapText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 2,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  tapSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: {
    backgroundColor: '#f97316',
    width: 24,
  },
  footer: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5,
  },
});
