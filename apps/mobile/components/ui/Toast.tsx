/**
 * Toast.tsx — Sonner-inspired stacking toast for React Native.
 *
 * Usage (anywhere in the app):
 *   import { toast } from '@/components/ui/Toast';
 *
 *   toast.success('Order saved');
 *   toast.error('Network error', 'Could not reach the server');
 *   toast.info('Heads up', 'You have 3 pending tickets');
 *
 * Mount once at the root layout:
 *   import { ToastViewport } from '@/components/ui/Toast';
 *   <Layout>
 *     <Slot />
 *     <ToastViewport />
 *   </Layout>
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// ─── Types ────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'info' | 'warning' | 'default';

export interface ToastOptions {
  id?: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number; // ms, default 4000
  action?: {
    label: string;
    onPress: () => void;
  };
}

interface ActiveToast extends ToastOptions {
  id: string;
  createdAt: number;
}

// ─── Global queue ─────────────────────────────────────────────

type Listener = (toasts: ActiveToast[]) => void;

class ToastManager {
  private toasts: ActiveToast[] = [];
  private listeners: Set<Listener> = new Set();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.toasts);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    for (const l of this.listeners) l(this.toasts);
  }

  push(opts: ToastOptions): string {
    const id = opts.id ?? `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const t: ActiveToast = {
      ...opts,
      id,
      createdAt: Date.now(),
      duration: opts.duration ?? 4000,
      variant: opts.variant ?? 'default',
    };
    this.toasts = [...this.toasts, t].slice(-4); // Cap at 4 visible
    this.emit();

    if (t.duration && t.duration > 0) {
      setTimeout(() => this.dismiss(id), t.duration);
    }
    return id;
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.emit();
  }

  clear() {
    this.toasts = [];
    this.emit();
  }
}

const manager = new ToastManager();

// ─── Public API ───────────────────────────────────────────────

export const toast = {
  show: (opts: ToastOptions) => manager.push(opts),
  success: (title: string, description?: string) =>
    manager.push({ title, description, variant: 'success' }),
  error: (title: string, description?: string) =>
    manager.push({ title, description, variant: 'error', duration: 6000 }),
  info: (title: string, description?: string) =>
    manager.push({ title, description, variant: 'info' }),
  warning: (title: string, description?: string) =>
    manager.push({ title, description, variant: 'warning', duration: 5000 }),
  dismiss: (id: string) => manager.dismiss(id),
  clear: () => manager.clear(),
};

// ─── ToastViewport ────────────────────────────────────────────

export function ToastViewport() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  useEffect(() => {
    return manager.subscribe(setToasts);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <SafeAreaView pointerEvents="box-none" style={styles.viewport} edges={['bottom']}>
      <View pointerEvents="box-none" style={styles.viewportInner}>
        {toasts.map((t, i) => (
          <ToastItem
            key={t.id}
            toast={t}
            index={toasts.length - 1 - i}
            total={toasts.length}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}

// ─── ToastItem ────────────────────────────────────────────────

interface ToastItemProps {
  toast: ActiveToast;
  index: number;
  total: number;
}

function ToastItem({ toast: t, index }: ToastItemProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(60)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const dismissedRef = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        damping: 16,
        stiffness: 130,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        damping: 14,
        stiffness: 140,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY, scale]);

  function dismiss() {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 30,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      manager.dismiss(t.id);
    });
  }

  const { variant = 'default' } = t;
  const palette = VARIANT_STYLES[variant];

  // Stacking visual offset for older toasts
  const stackOffset = index * 6;
  const stackScale = 1 - index * 0.04;

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity,
          transform: [
            { translateY: Animated.add(translateY, new Animated.Value(-stackOffset)) },
            { scale: Animated.multiply(scale, new Animated.Value(stackScale)) },
          ],
        },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: palette.iconBg }]}>
        <Ionicons name={palette.icon} size={18} color={palette.iconColor} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, { color: palette.titleColor }]} numberOfLines={2}>
          {t.title}
        </Text>
        {t.description ? (
          <Text style={styles.description} numberOfLines={3}>
            {t.description}
          </Text>
        ) : null}
      </View>
      {t.action ? (
        <Pressable
          onPress={() => {
            t.action!.onPress();
            dismiss();
          }}
          style={({ pressed }) => [
            styles.actionBtn,
            { borderColor: palette.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={[styles.actionText, { color: palette.titleColor }]}>
            {t.action.label}
          </Text>
        </Pressable>
      ) : null}
      <Pressable onPress={dismiss} hitSlop={10} style={styles.closeBtn}>
        <Ionicons name="close" size={16} color="#888" />
      </Pressable>
    </Animated.View>
  );
}

// ─── Variant palette ──────────────────────────────────────────

const VARIANT_STYLES: Record<
  ToastVariant,
  {
    bg: string;
    border: string;
    iconBg: string;
    iconColor: string;
    titleColor: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  default: {
    bg: '#1a1a2e',
    border: '#2a2a3a',
    iconBg: '#6366f122',
    iconColor: '#6366f1',
    titleColor: '#fff',
    icon: 'information-circle',
  },
  success: {
    bg: '#0f1f17',
    border: '#1f5235',
    iconBg: '#22c55e22',
    iconColor: '#22c55e',
    titleColor: '#86efac',
    icon: 'checkmark-circle',
  },
  error: {
    bg: '#1f1010',
    border: '#5b1a1a',
    iconBg: '#ef444422',
    iconColor: '#ef4444',
    titleColor: '#fca5a5',
    icon: 'alert-circle',
  },
  warning: {
    bg: '#1f180a',
    border: '#5b3e0e',
    iconBg: '#f59e0b22',
    iconColor: '#f59e0b',
    titleColor: '#fcd34d',
    icon: 'warning',
  },
  info: {
    bg: '#0a1622',
    border: '#155e75',
    iconBg: '#06b6d422',
    iconColor: '#06b6d4',
    titleColor: '#7dd3fc',
    icon: 'information-circle',
  },
};

// ─── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  viewport: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    pointerEvents: 'box-none',
  },
  viewportInner: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    alignItems: 'center',
    gap: 8,
  },
  toast: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 14,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  description: {
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 17,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  closeBtn: {
    padding: 4,
  },
});
