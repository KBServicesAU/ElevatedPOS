/**
 * AlertDialog.tsx — Imperative + declarative alert/confirm dialogs.
 *
 * Imperative usage (replaces Alert.alert):
 *   import { confirm, alert } from '@/components/ui/AlertDialog';
 *
 *   const ok = await confirm({
 *     title: 'Delete item?',
 *     description: 'This cannot be undone.',
 *     confirmLabel: 'Delete',
 *     destructive: true,
 *   });
 *   if (ok) doDelete();
 *
 *   await alert({ title: 'Success', description: 'Order saved.' });
 *
 * Mount once at the root layout:
 *   import { AlertDialogHost } from '@/components/ui/AlertDialog';
 *   <Layout>
 *     <Slot />
 *     <AlertDialogHost />
 *   </Layout>
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ─── Types ────────────────────────────────────────────────────

export type AlertVariant = 'info' | 'success' | 'warning' | 'destructive';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  variant?: AlertVariant;
}

export interface AlertOptions {
  title: string;
  description?: string;
  buttonLabel?: string;
  variant?: AlertVariant;
}

interface DialogRequest {
  id: string;
  type: 'alert' | 'confirm';
  options: ConfirmOptions | AlertOptions;
  resolve: (value: boolean) => void;
}

// ─── Manager ──────────────────────────────────────────────────

type Listener = (current: DialogRequest | null) => void;

class DialogManager {
  private queue: DialogRequest[] = [];
  private current: DialogRequest | null = null;
  private listeners: Set<Listener> = new Set();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    for (const l of this.listeners) l(this.current);
  }

  private next() {
    if (this.queue.length === 0) {
      this.current = null;
    } else {
      this.current = this.queue.shift() ?? null;
    }
    this.emit();
  }

  push(req: Omit<DialogRequest, 'id' | 'resolve'>): Promise<boolean> {
    return new Promise((resolve) => {
      const fullReq: DialogRequest = {
        ...req,
        id: `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        resolve,
      };
      if (this.current) {
        this.queue.push(fullReq);
      } else {
        this.current = fullReq;
        this.emit();
      }
    });
  }

  resolve(value: boolean) {
    if (this.current) {
      this.current.resolve(value);
    }
    this.next();
  }
}

const manager = new DialogManager();

// ─── Public API ───────────────────────────────────────────────

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return manager.push({ type: 'confirm', options: opts });
}

export function alert(opts: AlertOptions): Promise<boolean> {
  return manager.push({ type: 'alert', options: opts });
}

// ─── Variants ─────────────────────────────────────────────────

const VARIANT_STYLES: Record<
  AlertVariant,
  {
    iconBg: string;
    iconColor: string;
    icon: keyof typeof Ionicons.glyphMap;
    confirmBg: string;
    confirmText: string;
  }
> = {
  info: {
    iconBg: '#06b6d422',
    iconColor: '#06b6d4',
    icon: 'information-circle',
    confirmBg: '#6366f1',
    confirmText: '#fff',
  },
  success: {
    iconBg: '#22c55e22',
    iconColor: '#22c55e',
    icon: 'checkmark-circle',
    confirmBg: '#22c55e',
    confirmText: '#000',
  },
  warning: {
    iconBg: '#f59e0b22',
    iconColor: '#f59e0b',
    icon: 'warning',
    confirmBg: '#f59e0b',
    confirmText: '#000',
  },
  destructive: {
    iconBg: '#ef444422',
    iconColor: '#ef4444',
    icon: 'alert-circle',
    confirmBg: '#ef4444',
    confirmText: '#fff',
  },
};

// ─── Host ─────────────────────────────────────────────────────

export function AlertDialogHost() {
  const [current, setCurrent] = useState<DialogRequest | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    return manager.subscribe(setCurrent);
  }, []);

  useEffect(() => {
    if (current) {
      opacity.setValue(0);
      scale.setValue(0.92);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          damping: 16,
          stiffness: 160,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [current, opacity, scale]);

  if (!current) return null;

  const isConfirm = current.type === 'confirm';
  const opts = current.options as ConfirmOptions & AlertOptions;
  const variant: AlertVariant =
    opts.variant ?? ((opts as ConfirmOptions).destructive ? 'destructive' : 'info');
  const palette = VARIANT_STYLES[variant];
  const confirmLabel = (opts as ConfirmOptions).confirmLabel ?? 'OK';
  const cancelLabel = (opts as ConfirmOptions).cancelLabel ?? 'Cancel';
  const buttonLabel = (opts as AlertOptions).buttonLabel ?? 'OK';

  return (
    <Modal
      visible={!!current}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => manager.resolve(false)}
    >
      <Animated.View style={[styles.overlay, { opacity }]}>
        <Pressable
          style={styles.overlayPress}
          onPress={() => isConfirm && manager.resolve(false)}
        />
        <Animated.View
          style={[
            styles.dialog,
            { transform: [{ scale }] },
          ]}
        >
          <View style={[styles.iconCircle, { backgroundColor: palette.iconBg }]}>
            <Ionicons name={palette.icon} size={32} color={palette.iconColor} />
          </View>
          <Text style={styles.title}>{opts.title}</Text>
          {opts.description ? (
            <Text style={styles.description}>{opts.description}</Text>
          ) : null}

          {isConfirm ? (
            <View style={styles.btnRow}>
              <Pressable
                onPress={() => manager.resolve(false)}
                style={({ pressed }) => [
                  styles.cancelBtn,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.cancelBtnText}>{cancelLabel}</Text>
              </Pressable>
              <Pressable
                onPress={() => manager.resolve(true)}
                style={({ pressed }) => [
                  styles.confirmBtn,
                  { backgroundColor: palette.confirmBg },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[styles.confirmBtnText, { color: palette.confirmText }]}>
                  {confirmLabel}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => manager.resolve(true)}
              style={({ pressed }) => [
                styles.confirmBtn,
                styles.singleBtn,
                { backgroundColor: palette.confirmBg },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[styles.confirmBtnText, { color: palette.confirmText }]}>
                {buttonLabel}
              </Text>
            </Pressable>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  overlayPress: {
    ...StyleSheet.absoluteFillObject,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1a1a2e',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
    elevation: 24,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 19,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  description: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 6,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#22223a',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#9ca3af',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  singleBtn: {
    width: '100%',
    flex: 0,
    marginTop: 6,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
});
