/**
 * Dialog.tsx — Centred modal container with fade+scale entrance.
 *
 * Use for custom modals where AlertDialog isn't enough (e.g. forms).
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   <Dialog visible={open} onClose={() => setOpen(false)} title="Edit Name">
 *     <TextInput ... />
 *     <View style={{ flexDirection: 'row', gap: 8 }}>
 *       <Button variant="secondary" onPress={() => setOpen(false)}>Cancel</Button>
 *       <Button onPress={save}>Save</Button>
 *     </View>
 *   </Dialog>
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface DialogProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  /** Whether tapping the backdrop closes the dialog (default true) */
  dismissOnBackdrop?: boolean;
  /** Show the X close button (default true) */
  showCloseButton?: boolean;
  contentStyle?: ViewStyle;
  /** Maximum width (default 460) */
  maxWidth?: number;
}

export function Dialog({
  visible,
  onClose,
  title,
  description,
  children,
  dismissOnBackdrop = true,
  showCloseButton = true,
  contentStyle,
  maxWidth = 460,
}: DialogProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (visible) {
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
  }, [visible, opacity, scale]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.overlay, { opacity }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissOnBackdrop ? onClose : undefined}
        />
        <Animated.View
          style={[
            styles.dialog,
            { maxWidth, transform: [{ scale }] },
            contentStyle,
          ]}
        >
          {(title || showCloseButton) && (
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                {title && <Text style={styles.title}>{title}</Text>}
                {description && (
                  <Text style={styles.description}>{description}</Text>
                )}
              </View>
              {showCloseButton && (
                <Pressable
                  onPress={onClose}
                  hitSlop={10}
                  style={styles.closeBtn}
                >
                  <Ionicons name="close" size={20} color="#9ca3af" />
                </Pressable>
              )}
            </View>
          )}
          <View style={styles.body}>{children}</View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  dialog: {
    width: '100%',
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
    elevation: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.2,
  },
  description: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 4,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 8,
  },
  body: {
    padding: 22,
    paddingTop: 16,
  },
});
