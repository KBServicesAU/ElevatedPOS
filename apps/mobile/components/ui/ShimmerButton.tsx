/**
 * ShimmerButton — a high-emphasis CTA button with a passing-light effect.
 *
 * Useful for the "Charge", "Pay Now", "Place Order" buttons where we want
 * the user's eye drawn to the action. Combines:
 *
 *   - Press scale animation (0.96)
 *   - Loading state with ActivityIndicator
 *   - Continuous diagonal shimmer that sweeps across the surface
 *   - Optional icon (left or right)
 *
 * Usage:
 *   <ShimmerButton label="Pay Now" icon="card" onPress={...} />
 *   <ShimmerButton label="Processing..." loading />
 *   <ShimmerButton label="Done" variant="success" />
 */

import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type ShimmerVariant = 'primary' | 'success' | 'warning' | 'destructive';

const VARIANTS: Record<
  ShimmerVariant,
  { bg: string; shimmer: string; text: string }
> = {
  primary: { bg: '#6366f1', shimmer: 'rgba(255,255,255,0.32)', text: '#fff' },
  success: { bg: '#22c55e', shimmer: 'rgba(255,255,255,0.32)', text: '#fff' },
  warning: { bg: '#f59e0b', shimmer: 'rgba(255,255,255,0.32)', text: '#0a0a0a' },
  destructive: { bg: '#ef4444', shimmer: 'rgba(255,255,255,0.32)', text: '#fff' },
};

export interface ShimmerButtonProps {
  label: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  variant?: ShimmerVariant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function ShimmerButton({
  label,
  onPress,
  icon,
  iconRight,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
}: ShimmerButtonProps) {
  const palette = VARIANTS[variant];
  const shimmer = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (disabled || loading) {
      shimmer.stopAnimation();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 2400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(900),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [disabled, loading, shimmer]);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-260, 320],
  });

  function handlePressIn() {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      damping: 20,
      stiffness: 300,
    }).start();
  }

  function handlePressOut() {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      damping: 20,
      stiffness: 300,
    }).start();
  }

  return (
    <Animated.View
      style={[
        { transform: [{ scale }] },
        fullWidth ? { width: '100%' } : null,
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        style={[
          styles.btn,
          {
            backgroundColor: palette.bg,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {/* Shimmer overlay */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shimmer,
            {
              backgroundColor: palette.shimmer,
              transform: [{ translateX }, { rotate: '18deg' }],
            },
          ]}
        />
        <View style={styles.content}>
          {loading ? (
            <ActivityIndicator size="small" color={palette.text} />
          ) : icon ? (
            <Ionicons name={icon} size={18} color={palette.text} />
          ) : null}
          <Text style={[styles.label, { color: palette.text }]}>
            {label}
          </Text>
          {!loading && iconRight && (
            <Ionicons name={iconRight} size={18} color={palette.text} />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shimmer: {
    position: 'absolute',
    top: -40,
    bottom: -40,
    width: 120,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
