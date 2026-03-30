import { useRouter } from 'expo-router';
import React, { useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKioskStore } from '../store/kiosk';

export default function AgeVerificationScreen() {
  const router = useRouter();
  const {
    removeFromCart,
    setAgeVerified,
    pendingAgeRestrictedProductId,
    setPendingAgeRestrictedProductId,
    cartItems,
  } = useKioskStore();

  // Pulse animation for the warning icon to draw staff attention
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 900, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.8, duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.4, duration: 900, useNativeDriver: true }),
        ]),
      ]),
    ).start();
  }, [pulseAnim, glowAnim]);

  function handleStaffConfirmed() {
    setAgeVerified(true);
    setPendingAgeRestrictedProductId(null);
    router.back();
  }

  function handleRemoveItem() {
    if (pendingAgeRestrictedProductId) {
      const item = cartItems.find((i) => i.id === pendingAgeRestrictedProductId);
      if (item) {
        removeFromCart(item.cartKey);
      }
    }
    setPendingAgeRestrictedProductId(null);
    setAgeVerified(false);
    router.replace('/menu');
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Red warning header band */}
      <View style={styles.warningBand}>
        <Text style={styles.warningBandText}>⚠ AGE RESTRICTED ITEM ⚠</Text>
      </View>

      {/* Icon area */}
      <View style={styles.iconArea}>
        <Animated.View
          style={[
            styles.iconGlow,
            { opacity: glowAnim, transform: [{ scale: pulseAnim }] },
          ]}
        />
        <Animated.View
          style={[styles.iconCircle, { transform: [{ scale: pulseAnim }] }]}
        >
          <Text style={styles.iconEmoji}>🍷</Text>
        </Animated.View>
        <View style={styles.ageBadge}>
          <Text style={styles.ageBadgeText}>18+</Text>
        </View>
      </View>

      {/* Header */}
      <Text style={styles.header}>Age Restricted Item</Text>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Staff message card */}
      <View style={styles.messageCard}>
        <Text style={styles.messageIcon}>👮</Text>
        <View style={styles.messageTextArea}>
          <Text style={styles.messageTitle}>Staff Verification Required</Text>
          <Text style={styles.message}>
            A staff member must verify your age before adding this item to your order.
          </Text>
        </View>
      </View>

      {/* Instructions for customer */}
      <View style={styles.instructionCard}>
        <Text style={styles.instructionText}>
          Please wait for a staff member to check your ID.{'\n'}
          You must be 18 or older to purchase this item.
        </Text>
      </View>

      {/* Legal note */}
      <Text style={styles.legalNote}>
        Sale of alcohol or tobacco to persons under 18 is prohibited by law.
      </Text>

      {/* Buttons */}
      <View style={styles.buttonArea}>
        {/* Staff confirms — large, prominent green button */}
        <TouchableOpacity
          style={styles.confirmButton}
          onPress={handleStaffConfirmed}
          activeOpacity={0.85}
        >
          <Text style={styles.confirmButtonIcon}>✓</Text>
          <View style={styles.confirmButtonTextArea}>
            <Text style={styles.confirmButtonTitle}>Staff Confirmed (18+)</Text>
            <Text style={styles.confirmButtonSub}>Customer has been age verified by staff</Text>
          </View>
        </TouchableOpacity>

        {/* Remove item */}
        <TouchableOpacity
          style={styles.removeButton}
          onPress={handleRemoveItem}
          activeOpacity={0.85}
        >
          <Text style={styles.removeButtonIcon}>🗑</Text>
          <View style={styles.removeButtonTextArea}>
            <Text style={styles.removeButtonTitle}>Remove Item</Text>
            <Text style={styles.removeButtonSub}>Return to menu without this item</Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0000',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingBottom: 32,
  },

  // Red warning banner at top
  warningBand: {
    width: '120%',
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 28,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  warningBandText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 3,
  },

  // Icon
  iconArea: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    width: 140,
    height: 140,
  },
  iconGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#dc2626',
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1a0000',
    borderWidth: 3,
    borderColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 14,
  },
  iconEmoji: {
    fontSize: 56,
  },
  ageBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#dc2626',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: '#0d0000',
  },
  ageBadgeText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
  },

  header: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  divider: {
    width: 60,
    height: 3,
    backgroundColor: '#ef4444',
    borderRadius: 2,
    marginBottom: 20,
  },

  // Staff message
  messageCard: {
    backgroundColor: 'rgba(220,38,38,0.1)',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    borderWidth: 1.5,
    borderColor: 'rgba(220,38,38,0.4)',
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  messageIcon: {
    fontSize: 32,
    marginTop: 2,
  },
  messageTextArea: {
    flex: 1,
  },
  messageTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ef4444',
    marginBottom: 6,
  },
  message: {
    fontSize: 18,
    color: '#ccc',
    lineHeight: 26,
  },

  // Customer instructions
  instructionCard: {
    backgroundColor: '#111',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 12,
    alignItems: 'center',
  },
  instructionText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    lineHeight: 24,
  },

  legalNote: {
    fontSize: 12,
    color: '#444',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
    paddingHorizontal: 8,
  },

  // Buttons
  buttonArea: {
    width: '100%',
    gap: 14,
  },
  confirmButton: {
    backgroundColor: '#16a34a',
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
    minHeight: 88,
  },
  confirmButtonIcon: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '900',
  },
  confirmButtonTextArea: {
    flex: 1,
  },
  confirmButtonTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  confirmButtonSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 3,
  },
  removeButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1.5,
    borderColor: '#333',
    minHeight: 80,
  },
  removeButtonIcon: {
    fontSize: 24,
  },
  removeButtonTextArea: {
    flex: 1,
  },
  removeButtonTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  removeButtonSub: {
    fontSize: 13,
    color: '#666',
    marginTop: 3,
  },
});
