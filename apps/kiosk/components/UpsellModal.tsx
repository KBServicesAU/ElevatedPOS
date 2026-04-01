import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useKioskStore } from '../store/kiosk';

const AUTO_DISMISS_MS = 8000;

// Fallback popular items shown when API returns no results
const FALLBACK_SUGGESTIONS = [
  {
    id: 'up_1',
    name: 'Garlic Bread',
    price: 7.0,
    emoji: '🥖',
    description: 'Sourdough, herb butter, parmesan',
    category: 'Extras',
  },
  {
    id: 'up_2',
    name: 'Sweet Potato Fries',
    price: 9.0,
    emoji: '🍟',
    description: 'With smoky chipotle mayo',
    category: 'Extras',
  },
  {
    id: 'up_3',
    name: 'Lemon Iced Tea',
    price: 6.0,
    emoji: '🍋',
    description: 'House-brewed iced tea with fresh lemon',
    category: 'Drinks',
  },
];

interface UpsellProduct {
  id: string;
  name: string;
  price: number;
  emoji: string;
  description: string;
  category?: string;
}

interface UpsellModalProps {
  visible: boolean;
  /** ID of the product just added — used to fetch related suggestions */
  triggerProductId: string | null;
  onDismiss: () => void;
}

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export default function UpsellModal({ visible, triggerProductId, onDismiss }: UpsellModalProps) {
  const { addToCart, cartItems } = useKioskStore();
  const [suggestions, setSuggestions] = useState<UpsellProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [countdown, setCountdown] = useState(AUTO_DISMISS_MS / 1000);

  // Slide-up animation
  const slideAnim = useRef(new Animated.Value(400)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Progress bar for auto-dismiss countdown
  const progressAnim = useRef(new Animated.Value(1)).current;

  // Timers
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const cartCount = cartItems.reduce((sum, i) => sum + i.qty, 0);

  // Only show for small orders (1–3 items added so far)
  const shouldShow = cartCount >= 1 && cartCount <= 3;

  function clearTimers() {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
      countdownInterval.current = null;
    }
  }

  function startAutoDismiss() {
    clearTimers();
    setCountdown(AUTO_DISMISS_MS / 1000);
    progressAnim.setValue(1);

    // Animated progress bar draining over AUTO_DISMISS_MS
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: AUTO_DISMISS_MS,
      useNativeDriver: false,
    }).start();

    // Countdown display every second
    countdownInterval.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearTimers();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Auto-dismiss after 8 seconds
    dismissTimer.current = setTimeout(() => {
      clearTimers();
      onDismiss();
    }, AUTO_DISMISS_MS);
  }

  function handleUserInteraction() {
    // Any user interaction (adding item, etc.) resets the timer
    startAutoDismiss();
  }

  useEffect(() => {
    if (visible && shouldShow) {
      setAddedIds([]);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
      fetchSuggestions();
      startAutoDismiss();
    } else if (!visible) {
      clearTimers();
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 400, duration: 260, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
    return () => {
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, shouldShow]);

  const fetchSuggestions = useCallback(async () => {
    if (!triggerProductId) {
      setSuggestions(FALLBACK_SUGGESTIONS);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/catalog/products/${triggerProductId}/related?limit=3`,
        { signal: (AbortSignal as unknown as { timeout(ms: number): AbortSignal }).timeout(4000) },
      );
      if (res.ok) {
        const data = await res.json();
        const items: UpsellProduct[] = Array.isArray(data?.data) ? data.data : [];
        setSuggestions(items.length > 0 ? items.slice(0, 3) : FALLBACK_SUGGESTIONS);
      } else {
        setSuggestions(FALLBACK_SUGGESTIONS);
      }
    } catch {
      setSuggestions(FALLBACK_SUGGESTIONS);
    } finally {
      setLoading(false);
    }
  }, [triggerProductId]);

  function handleAdd(product: UpsellProduct) {
    addToCart({
      id: product.id,
      cartKey: `${product.id}_upsell_${Date.now()}`,
      name: product.name,
      price: product.price,
      qty: 1,
      modifiers: [],
    });
    setAddedIds((prev) => [...prev, product.id]);
    handleUserInteraction();
  }

  function handleDismiss() {
    clearTimers();
    onDismiss();
  }

  // Don't render at all if cart is too large
  if (!shouldShow && visible) {
    onDismiss();
    return null;
  }

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={handleDismiss}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.overlayTouchable} onPress={handleDismiss} activeOpacity={1} />

        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Auto-dismiss progress bar */}
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressBar, { width: progressWidth }]} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerEmoji}>✨</Text>
            <View style={styles.headerText}>
              <Text style={styles.title}>Would you like to add…?</Text>
              <Text style={styles.subtitle}>Popular pairings for your order</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={handleDismiss}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          {loading ? (
            <View style={styles.loadingArea}>
              <ActivityIndicator size="large" color="#f59e0b" />
              <Text style={styles.loadingText}>Finding pairings…</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cardsRow}
              bounces
            >
              {suggestions.map((product) => {
                const isAdded = addedIds.includes(product.id);
                return (
                  <View key={product.id} style={styles.card}>
                    {/* Image placeholder — colored square */}
                    <View style={[styles.cardImagePlaceholder, { backgroundColor: PLACEHOLDER_COLORS[product.id.charCodeAt(product.id.length - 1) % PLACEHOLDER_COLORS.length] }]}>
                      <Text style={styles.emojiText}>{product.emoji}</Text>
                    </View>
                    <Text style={styles.cardName}>{product.name}</Text>
                    <Text style={styles.cardDesc} numberOfLines={2}>
                      {product.description}
                    </Text>
                    <Text style={styles.cardPrice}>${product.price.toFixed(2)}</Text>
                    <TouchableOpacity
                      style={[styles.addButton, isAdded && styles.addButtonAdded]}
                      onPress={() => handleAdd(product)}
                      disabled={isAdded}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.addButtonText}>
                        {isAdded ? '✓ Added' : '+ Add'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* No Thanks with countdown */}
          <TouchableOpacity style={styles.noThanksBtn} onPress={handleDismiss} activeOpacity={0.7}>
            <Text style={styles.noThanksText}>
              No Thanks — Continue{countdown > 0 ? ` (${countdown}s)` : ''}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// Distinct muted colours for image placeholders
const PLACEHOLDER_COLORS = [
  '#2d1f0e',
  '#0e2d1a',
  '#0e1a2d',
  '#2d1a0e',
  '#1a0e2d',
  '#1a2d0e',
];

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  overlayTouchable: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 40,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: '#222',
    borderBottomWidth: 0,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#333',
    alignSelf: 'center',
    marginBottom: 8,
  },

  // Auto-dismiss progress bar
  progressTrack: {
    height: 3,
    backgroundColor: '#1e1e1e',
    marginHorizontal: 24,
    borderRadius: 2,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#f59e0b',
    borderRadius: 2,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 20,
    gap: 12,
  },
  headerEmoji: {
    fontSize: 30,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: '#888',
    fontWeight: '700',
  },
  loadingArea: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 14,
  },
  loadingText: {
    color: '#666',
    fontSize: 15,
  },
  cardsRow: {
    paddingHorizontal: 20,
    gap: 14,
    paddingBottom: 4,
  },
  card: {
    width: 180,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardImagePlaceholder: {
    borderRadius: 14,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emojiText: {
    fontSize: 40,
  },
  cardName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 10,
  },
  cardPrice: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f59e0b',
    marginBottom: 14,
  },
  addButton: {
    backgroundColor: '#f59e0b',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addButtonAdded: {
    backgroundColor: '#16a34a',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000',
  },
  noThanksBtn: {
    marginHorizontal: 24,
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  noThanksText: {
    fontSize: 17,
    color: '#888',
    fontWeight: '600',
  },
});
