import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ModifierGroup, SelectedModifier } from '../store/kiosk';

interface ModifierModalProduct {
  id: string;
  name: string;
  price: number;
  modifierGroups: ModifierGroup[];
}

interface ModifierModalProps {
  visible: boolean;
  product: ModifierModalProduct | null;
  onAddToCart: (modifiers: SelectedModifier[]) => void;
  onDismiss: () => void;
}

export default function ModifierModal({
  visible,
  product,
  onAddToCart,
  onDismiss,
}: ModifierModalProps) {
  // selections keyed by group name -> set of option names
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});

  // Slide-up animation
  const slideAnim = useRef(new Animated.Value(600)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Reset selections when product changes
  useEffect(() => {
    if (visible && product) {
      const initial: Record<string, Set<string>> = {};
      for (const group of product.modifierGroups) {
        initial[group.name] = new Set<string>();
      }
      setSelections(initial);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (!visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 600,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, product?.id]);

  const toggleOption = useCallback(
    (groupName: string, optionName: string, maxSelections: number) => {
      setSelections((prev) => {
        const current = new Set(prev[groupName] ?? []);
        if (maxSelections === 1) {
          // Radio behavior: replace selection
          if (current.has(optionName)) {
            current.delete(optionName);
          } else {
            current.clear();
            current.add(optionName);
          }
        } else {
          // Checkbox behavior
          if (current.has(optionName)) {
            current.delete(optionName);
          } else if (current.size < maxSelections) {
            current.add(optionName);
          }
        }
        return { ...prev, [groupName]: current };
      });
    },
    [],
  );

  // Calculate modifier total
  const modifierTotal = useMemo(() => {
    if (!product) return 0;
    let total = 0;
    for (const group of product.modifierGroups) {
      const selected = selections[group.name];
      if (!selected) continue;
      for (const option of group.options) {
        if (selected.has(option.name)) {
          total += option.price;
        }
      }
    }
    return total;
  }, [product, selections]);

  const grandTotal = (product?.price ?? 0) + modifierTotal;

  // Validation: all required groups must have at least one selection
  const isValid = useMemo(() => {
    if (!product) return false;
    for (const group of product.modifierGroups) {
      if (group.required) {
        const selected = selections[group.name];
        if (!selected || selected.size === 0) return false;
      }
    }
    return true;
  }, [product, selections]);

  function handleAdd() {
    if (!product || !isValid) return;

    const modifiers: SelectedModifier[] = [];
    for (const group of product.modifierGroups) {
      const selected = selections[group.name];
      if (!selected) continue;
      for (const option of group.options) {
        if (selected.has(option.name)) {
          modifiers.push({
            groupId: group.name,
            groupName: group.name,
            optionId: option.name,
            optionName: option.name,
            priceAdjustment: option.price,
          });
        }
      }
    }
    onAddToCart(modifiers);
  }

  if (!product) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onDismiss}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={styles.overlayTouchable}
          onPress={onDismiss}
          activeOpacity={1}
        />

        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
        >
          {/* Handle */}
          <View style={styles.handle} />

          {/* Product name header */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{product.name}</Text>
              <Text style={styles.basePrice}>
                Base price: ${product.price.toFixed(2)}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onDismiss}>
              <Text style={styles.closeBtnText}>X</Text>
            </TouchableOpacity>
          </View>

          {/* Modifier groups */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces
          >
            {product.modifierGroups.map((group) => {
              const selectedSet = selections[group.name] ?? new Set<string>();
              return (
                <View key={group.name} style={styles.group}>
                  {/* Group header */}
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupName}>{group.name}</Text>
                    <View
                      style={[
                        styles.badge,
                        group.required
                          ? styles.badgeRequired
                          : styles.badgeOptional,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          group.required
                            ? styles.badgeTextRequired
                            : styles.badgeTextOptional,
                        ]}
                      >
                        {group.required ? 'Required' : 'Optional'}
                      </Text>
                    </View>
                    {group.maxSelections > 1 && (
                      <Text style={styles.maxNote}>
                        (up to {group.maxSelections})
                      </Text>
                    )}
                  </View>

                  {/* Options */}
                  {group.options.map((option) => {
                    const isSelected = selectedSet.has(option.name);
                    const isRadio = group.maxSelections === 1;
                    return (
                      <TouchableOpacity
                        key={option.name}
                        style={[
                          styles.optionRow,
                          isSelected && styles.optionRowSelected,
                        ]}
                        onPress={() =>
                          toggleOption(
                            group.name,
                            option.name,
                            group.maxSelections,
                          )
                        }
                        activeOpacity={0.7}
                      >
                        {/* Radio / Checkbox indicator */}
                        <View
                          style={[
                            isRadio ? styles.radio : styles.checkbox,
                            isSelected &&
                              (isRadio
                                ? styles.radioSelected
                                : styles.checkboxSelected),
                          ]}
                        >
                          {isSelected && (
                            <View
                              style={
                                isRadio
                                  ? styles.radioDot
                                  : styles.checkboxCheck
                              }
                            >
                              {!isRadio && (
                                <Text style={styles.checkmark}>
                                  {'✓'}
                                </Text>
                              )}
                            </View>
                          )}
                        </View>

                        <Text style={styles.optionName}>{option.name}</Text>

                        {option.price > 0 && (
                          <Text style={styles.optionPrice}>
                            +${option.price.toFixed(2)}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>

          {/* Bottom buttons */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onDismiss}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.addBtn, !isValid && styles.addBtnDisabled]}
              onPress={handleAdd}
              activeOpacity={isValid ? 0.8 : 1}
              disabled={!isValid}
            >
              <Text style={styles.addBtnText}>
                Add to Cart - ${grandTotal.toFixed(2)}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

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
    paddingTop: 12,
    maxHeight: '85%',
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
    marginBottom: 12,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  basePrice: {
    fontSize: 15,
    color: '#888',
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

  // Scroll area
  scrollArea: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },

  // Group
  group: {
    marginBottom: 20,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  groupName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeRequired: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  badgeOptional: {
    backgroundColor: 'rgba(100,100,100,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(100,100,100,0.3)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextRequired: {
    color: '#ef4444',
  },
  badgeTextOptional: {
    color: '#888',
  },
  maxNote: {
    fontSize: 12,
    color: '#666',
  },

  // Option rows
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    gap: 12,
  },
  optionRowSelected: {
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245,158,11,0.08)',
  },

  // Radio
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#f59e0b',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#f59e0b',
  },

  // Checkbox
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    borderColor: '#f59e0b',
    backgroundColor: '#f59e0b',
  },
  checkboxCheck: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
    lineHeight: 16,
  },

  optionName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  optionPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f59e0b',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cancelText: {
    fontSize: 17,
    color: '#888',
    fontWeight: '600',
  },
  addBtn: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
  },
  addBtnDisabled: {
    backgroundColor: '#3a3a3a',
  },
  addBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#000',
  },
});
