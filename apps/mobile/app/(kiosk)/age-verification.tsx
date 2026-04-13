import React, { useEffect, useRef } from 'react';
import {
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
import { useKioskStore, t } from '../../store/kiosk';

export default function AgeVerificationScreen() {
  const router = useRouter();
  const setAgeVerified = useKioskStore((s) => s.setAgeVerified);
  const removeFromCart = useKioskStore((s) => s.removeFromCart);
  const cartItems = useKioskStore((s) => s.cartItems);
  const pendingAgeRestrictedProductId = useKioskStore(
    (s) => s.pendingAgeRestrictedProductId,
  );
  const setPendingAgeRestrictedProductId = useKioskStore(
    (s) => s.setPendingAgeRestrictedProductId,
  );
  const language = useKioskStore((s) => s.language);

  // Pulse halo animation around the icon
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim2 = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0.8)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Card fade-in
    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(iconScale, {
        toValue: 1,
        damping: 8,
        stiffness: 90,
        useNativeDriver: true,
      }),
    ]).start();

    const makePulse = (anim: Animated.Value, delay = 0) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 1800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );

    const p1 = makePulse(pulseAnim, 0);
    const p2 = makePulse(pulseAnim2, 900);
    p1.start();
    p2.start();

    return () => {
      p1.stop();
      p2.stop();
    };
  }, [pulseAnim, pulseAnim2, iconScale, cardOpacity]);

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.4],
  });
  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0],
  });
  const pulseScale2 = pulseAnim2.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.4],
  });
  const pulseOpacity2 = pulseAnim2.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0],
  });

  function handleConfirm() {
    setAgeVerified(true);
    setPendingAgeRestrictedProductId(null);
    router.back();
  }

  function handleDeny() {
    if (pendingAgeRestrictedProductId) {
      // removeFromCart accepts a cartKey, not a product id.
      // Find the most-recently-added cart item for this product and remove by cartKey.
      const match = cartItems
        .filter((i) => i.id === pendingAgeRestrictedProductId)
        .at(-1);
      if (match) {
        removeFromCart(match.cartKey);
      }
    }
    setPendingAgeRestrictedProductId(null);
    router.back();
  }

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.card, { opacity: cardOpacity }]}>
        {/* Pulsing halo around icon */}
        <View style={styles.iconWrap}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pulse,
              { opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pulse,
              { opacity: pulseOpacity2, transform: [{ scale: pulseScale2 }] },
            ]}
          />
          <Animated.View
            style={[styles.iconCircle, { transform: [{ scale: iconScale }] }]}
          >
            <Text style={styles.iconText}>18+</Text>
          </Animated.View>
        </View>

        <Text style={styles.title}>{t(language, 'ageVerificationRequired')}</Text>
        <Text style={styles.subtitle}>
          {t(language, 'ageVerificationSubtitle')}
        </Text>
        <Text style={styles.legal}>
          {t(language, 'ageVerificationLegal')}
        </Text>

        <TouchableOpacity
          style={styles.confirmBtn}
          onPress={handleConfirm}
          activeOpacity={0.9}
        >
          <Ionicons name="checkmark-circle" size={22} color="#fff" />
          <Text style={styles.confirmBtnText}>{t(language, 'yesIAm18')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.denyBtn}
          onPress={handleDeny}
          activeOpacity={0.9}
        >
          <Ionicons name="close-circle-outline" size={20} color="#888" />
          <Text style={styles.denyBtnText}>{t(language, 'noRemoveItem')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    backgroundColor: '#141414',
    borderRadius: 28,
    padding: 36,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    maxWidth: 460,
    width: '100%',
  },
  iconWrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  pulse: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f97316',
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#f97316',
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  iconText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 14,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#bbb',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 14,
  },
  legal: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  confirmBtn: {
    width: '100%',
    backgroundColor: '#f97316',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
    shadowColor: '#f97316',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  confirmBtnText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
  },
  denyBtn: {
    width: '100%',
    backgroundColor: '#1e1e1e',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  denyBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#888',
  },
});
