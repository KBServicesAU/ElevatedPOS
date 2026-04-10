/**
 * CommandPalette — a Cmd+K style "jump to anywhere" search modal.
 *
 * Provides a fast, keyboard-friendly way to navigate the POS — staff can
 * search for products, customers, orders, screens, and recent actions
 * from a single overlay.
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *
 *   <CommandPalette
 *     visible={open}
 *     onClose={() => setOpen(false)}
 *     items={[
 *       { id: 'sell', label: 'Sell', icon: 'cart', section: 'Screens', onSelect: () => router.push('/(pos)') },
 *       ...
 *     ]}
 *   />
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  /** Group label — items are sorted into sections by this. */
  section?: string;
  /** Optional shortcut hint shown on the right (e.g. "⌘P"). */
  shortcut?: string;
  /** Extra search terms not visible in the label. */
  keywords?: string[];
  onSelect: () => void;
}

export interface CommandPaletteProps {
  visible: boolean;
  onClose: () => void;
  items: CommandItem[];
  placeholder?: string;
  emptyMessage?: string;
}

export function CommandPalette({
  visible,
  onClose,
  items,
  placeholder = 'Search anything…',
  emptyMessage = 'No results',
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setQuery('');
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          damping: 18,
          stiffness: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Slight delay so the modal has mounted before focusing.
        setTimeout(() => inputRef.current?.focus(), 80);
      });
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.92,
          duration: 140,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, opacity, scale]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = [
        it.label.toLowerCase(),
        it.description?.toLowerCase() ?? '',
        it.section?.toLowerCase() ?? '',
        ...(it.keywords?.map((k) => k.toLowerCase()) ?? []),
      ].join(' ');
      return hay.includes(q);
    });
  }, [items, query]);

  // Group by section
  const sections = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const it of filtered) {
      const key = it.section ?? '';
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
  }, [filtered]);

  // Flatten with section headers for FlatList
  const rows = useMemo(() => {
    const out: Array<
      | { type: 'header'; id: string; title: string }
      | { type: 'item'; id: string; item: CommandItem }
    > = [];
    for (const sec of sections) {
      if (sec.title) {
        out.push({ type: 'header', id: `h:${sec.title}`, title: sec.title });
      }
      for (const it of sec.data) {
        out.push({ type: 'item', id: `i:${it.id}`, item: it });
      }
    }
    return out;
  }, [sections]);

  function handleSelect(item: CommandItem) {
    onClose();
    setTimeout(() => item.onSelect(), 60);
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.center}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
          {/* Search bar */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#666" />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder={placeholder}
              placeholderTextColor="#555"
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            <Pressable onPress={onClose} hitSlop={8}>
              <View style={styles.escBadge}>
                <Text style={styles.escText}>ESC</Text>
              </View>
            </Pressable>
          </View>

          {/* Results */}
          {rows.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="sad-outline" size={40} color="#333" />
              <Text style={styles.emptyText}>{emptyMessage}</Text>
            </View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(r) => r.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 8 }}
              renderItem={({ item }) => {
                if (item.type === 'header') {
                  return (
                    <Text style={styles.sectionTitle}>{item.title.toUpperCase()}</Text>
                  );
                }
                const it = item.item;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.row,
                      pressed && { backgroundColor: '#1e1e35' },
                    ]}
                    onPress={() => handleSelect(it)}
                  >
                    {it.icon && (
                      <View
                        style={[
                          styles.iconWrap,
                          { backgroundColor: `${it.iconColor ?? '#6366f1'}22` },
                        ]}
                      >
                        <Ionicons
                          name={it.icon}
                          size={16}
                          color={it.iconColor ?? '#6366f1'}
                        />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>{it.label}</Text>
                      {it.description && (
                        <Text style={styles.rowDesc} numberOfLines={1}>
                          {it.description}
                        </Text>
                      )}
                    </View>
                    {it.shortcut && (
                      <View style={styles.shortcutBadge}>
                        <Text style={styles.shortcutText}>{it.shortcut}</Text>
                      </View>
                    )}
                    <Ionicons name="return-down-back" size={14} color="#444" />
                  </Pressable>
                );
              }}
            />
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 100,
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    maxWidth: 600,
    maxHeight: 480,
    backgroundColor: '#0d0d14',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    overflow: 'hidden',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    padding: 0,
  },
  escBadge: {
    backgroundColor: '#1a1a2e',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  escText: {
    color: '#666',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    color: '#666',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  rowDesc: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  shortcutBadge: {
    backgroundColor: '#1a1a2e',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  shortcutText: {
    color: '#888',
    fontSize: 10,
    fontWeight: '700',
  },
  empty: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    color: '#555',
    fontSize: 13,
  },
});
