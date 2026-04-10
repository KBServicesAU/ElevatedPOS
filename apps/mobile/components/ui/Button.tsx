/**
 * Button.tsx — Variant-based pressable button.
 *
 * Usage:
 *   import { Button } from '@/components/ui/Button';
 *
 *   <Button onPress={save}>Save</Button>
 *   <Button variant="destructive" onPress={del}>Delete</Button>
 *   <Button variant="secondary" icon="cog-outline">Settings</Button>
 *   <Button loading>Loading…</Button>
 *   <Button size="lg" fullWidth>Continue</Button>
 */

import React, { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'destructive'
  | 'success'
  | 'warning'
  | 'ghost'
  | 'outline';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  children?: React.ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  disabled,
  fullWidth,
  style,
  textStyle,
}: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const palette = VARIANT_PALETTE[variant];
  const sizing = SIZE_PALETTE[size];
  const isInactive = disabled || loading;

  function handlePressIn() {
    Animated.spring(scale, {
      toValue: 0.96,
      damping: 18,
      stiffness: 300,
      useNativeDriver: true,
    }).start();
  }

  function handlePressOut() {
    Animated.spring(scale, {
      toValue: 1,
      damping: 14,
      stiffness: 220,
      useNativeDriver: true,
    }).start();
  }

  return (
    <Animated.View
      style={[
        fullWidth && { width: '100%' },
        { transform: [{ scale }] },
      ]}
    >
      <Pressable
        onPress={isInactive ? undefined : onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isInactive}
        style={({ pressed }) => [
          styles.base,
          {
            backgroundColor: palette.bg,
            borderColor: palette.border,
            borderWidth: palette.borderWidth,
            paddingHorizontal: sizing.px,
            paddingVertical: sizing.py,
            borderRadius: sizing.radius,
          },
          isInactive && styles.inactive,
          pressed && !isInactive && { opacity: 0.92 },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={palette.text} />
        ) : (
          <View style={styles.row}>
            {icon ? (
              <Ionicons
                name={icon}
                size={sizing.icon}
                color={palette.text}
                style={{ marginRight: children ? 8 : 0 }}
              />
            ) : null}
            {children ? (
              <Text
                style={[
                  styles.text,
                  {
                    color: palette.text,
                    fontSize: sizing.fontSize,
                    fontWeight: variant === 'ghost' ? '700' : '900',
                  },
                  textStyle,
                ]}
                numberOfLines={1}
              >
                {children}
              </Text>
            ) : null}
            {iconRight ? (
              <Ionicons
                name={iconRight}
                size={sizing.icon}
                color={palette.text}
                style={{ marginLeft: children ? 8 : 0 }}
              />
            ) : null}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─── Variant palette ──────────────────────────────────────────

const VARIANT_PALETTE: Record<
  ButtonVariant,
  { bg: string; border: string; borderWidth: number; text: string }
> = {
  primary: {
    bg: '#6366f1',
    border: '#6366f1',
    borderWidth: 0,
    text: '#fff',
  },
  secondary: {
    bg: '#22223a',
    border: '#2a2a3a',
    borderWidth: 1,
    text: '#e5e7eb',
  },
  destructive: {
    bg: '#ef4444',
    border: '#ef4444',
    borderWidth: 0,
    text: '#fff',
  },
  success: {
    bg: '#22c55e',
    border: '#22c55e',
    borderWidth: 0,
    text: '#000',
  },
  warning: {
    bg: '#f59e0b',
    border: '#f59e0b',
    borderWidth: 0,
    text: '#000',
  },
  ghost: {
    bg: 'transparent',
    border: 'transparent',
    borderWidth: 0,
    text: '#9ca3af',
  },
  outline: {
    bg: 'transparent',
    border: '#2a2a3a',
    borderWidth: 1,
    text: '#e5e7eb',
  },
};

const SIZE_PALETTE: Record<
  ButtonSize,
  { px: number; py: number; radius: number; fontSize: number; icon: number }
> = {
  sm: { px: 12, py: 8, radius: 10, fontSize: 12, icon: 14 },
  md: { px: 16, py: 12, radius: 12, fontSize: 14, icon: 18 },
  lg: { px: 20, py: 16, radius: 14, fontSize: 16, icon: 20 },
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  inactive: {
    opacity: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});
