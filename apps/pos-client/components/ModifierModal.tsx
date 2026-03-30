import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import type { Product, ModifierGroup, ModifierOption } from './ProductSearch';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Maps groupId → selected optionIds */
export type SelectedModifiers = Record<string, string[]>;

interface ModifierModalProps {
  visible: boolean;
  product: Product;
  onConfirm: (modifiers: SelectedModifiers) => void;
  onCancel: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPriceDelta(delta: number): string {
  if (delta === 0) return '';
  const sign = delta > 0 ? '+' : '';
  return `${sign}$${(Math.abs(delta) / 100).toFixed(2)}`;
}

function isGroupSatisfied(group: ModifierGroup, selected: string[]): boolean {
  return selected.length >= group.minSelections && selected.length <= group.maxSelections;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ModifierModal({
  visible,
  product,
  onConfirm,
  onCancel,
}: ModifierModalProps) {
  const groups = product.modifierGroups ?? [];

  const [selected, setSelected] = useState<SelectedModifiers>(() =>
    Object.fromEntries(groups.map((g) => [g.id, []])),
  );
  const [submitted, setSubmitted] = useState(false);

  const toggleOption = (group: ModifierGroup, option: ModifierOption) => {
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      const isSelected = current.includes(option.id);

      if (isSelected) {
        // Deselect
        return { ...prev, [group.id]: current.filter((id) => id !== option.id) };
      }

      // Select — enforce maxSelections
      if (group.maxSelections === 1) {
        // Single select
        return { ...prev, [group.id]: [option.id] };
      }
      if (current.length >= group.maxSelections) {
        // Replace oldest selection
        return { ...prev, [group.id]: [...current.slice(1), option.id] };
      }
      return { ...prev, [group.id]: [...current, option.id] };
    });
  };

  const validationErrors: Record<string, string> = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const group of groups) {
      const sel = selected[group.id] ?? [];
      if (sel.length < group.minSelections) {
        errors[group.id] =
          group.minSelections === 1
            ? 'Required — please select an option'
            : `Select at least ${group.minSelections} option${group.minSelections > 1 ? 's' : ''}`;
      }
    }
    return errors;
  }, [groups, selected]);

  const allValid = Object.keys(validationErrors).length === 0;

  // Extra price total from selected modifiers
  const extraTotal = useMemo(() => {
    let total = 0;
    for (const group of groups) {
      const sel = selected[group.id] ?? [];
      for (const optId of sel) {
        const opt = group.options.find((o) => o.id === optId);
        if (opt) total += opt.priceDelta;
      }
    }
    return total;
  }, [groups, selected]);

  const handleAddToOrder = () => {
    setSubmitted(true);
    if (!allValid) return;
    onConfirm(selected);
  };

  const handleCancel = () => {
    setSubmitted(false);
    setSelected(Object.fromEntries(groups.map((g) => [g.id, []])));
    onCancel();
  };

  const basePrice = product.price / 100;
  const finalPrice = basePrice + extraTotal / 100;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleCancel}>
      <View style={mm.overlay}>
        <SafeAreaView style={mm.sheetWrapper}>
          <View style={mm.sheet}>
            {/* Header */}
            <View style={mm.header}>
              <View style={mm.headerInfo}>
                <Text style={mm.headerName} numberOfLines={2}>
                  {product.name}
                </Text>
                <Text style={mm.headerPrice}>
                  ${finalPrice.toFixed(2)}
                  {extraTotal !== 0 && (
                    <Text style={mm.headerPriceExtra}>
                      {' '}({formatPriceDelta(extraTotal)})
                    </Text>
                  )}
                </Text>
              </View>
              <TouchableOpacity onPress={handleCancel} style={mm.closeBtn}>
                <Text style={mm.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {groups.length === 0 ? (
              <View style={mm.noModifiers}>
                <Text style={mm.noModifiersText}>No customisation options for this product.</Text>
              </View>
            ) : (
              <ScrollView
                style={mm.scroll}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={mm.scrollContent}
              >
                {groups.map((group) => {
                  const sel = selected[group.id] ?? [];
                  const hasError = submitted && !!validationErrors[group.id];
                  const satisfied = isGroupSatisfied(group, sel);

                  return (
                    <View
                      key={group.id}
                      style={[mm.groupCard, hasError && mm.groupCardError]}
                    >
                      {/* Group header */}
                      <View style={mm.groupHeader}>
                        <Text style={mm.groupName}>{group.name}</Text>
                        <View style={mm.groupMeta}>
                          {group.minSelections > 0 && (
                            <View style={[mm.reqBadge, satisfied && mm.reqBadgeSatisfied]}>
                              <Text
                                style={[
                                  mm.reqBadgeText,
                                  satisfied && mm.reqBadgeTextSatisfied,
                                ]}
                              >
                                {group.minSelections > 0 ? 'Required' : 'Optional'}
                              </Text>
                            </View>
                          )}
                          <Text style={mm.groupLimit}>
                            {group.maxSelections === 1
                              ? 'Choose 1'
                              : `Up to ${group.maxSelections}`}
                          </Text>
                        </View>
                      </View>

                      {/* Error message */}
                      {hasError && (
                        <Text style={mm.errorText}>{validationErrors[group.id]}</Text>
                      )}

                      {/* Options chips */}
                      <View style={mm.optionsWrap}>
                        {group.options.map((opt) => {
                          const isSelected = sel.includes(opt.id);
                          return (
                            <TouchableOpacity
                              key={opt.id}
                              style={[mm.chip, isSelected && mm.chipSelected]}
                              onPress={() => toggleOption(group, opt)}
                            >
                              <Text style={[mm.chipName, isSelected && mm.chipNameSelected]}>
                                {opt.name}
                              </Text>
                              {opt.priceDelta !== 0 && (
                                <Text
                                  style={[mm.chipDelta, isSelected && mm.chipDeltaSelected]}
                                >
                                  {formatPriceDelta(opt.priceDelta)}
                                </Text>
                              )}
                              {isSelected && <Text style={mm.chipCheck}>✓</Text>}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {/* Add to Order button */}
            <View style={mm.footer}>
              {submitted && !allValid && (
                <Text style={mm.footerError}>
                  Please complete all required selections above
                </Text>
              )}
              <TouchableOpacity style={mm.addBtn} onPress={handleAddToOrder}>
                <Text style={mm.addBtnText}>
                  Add to Order — ${finalPrice.toFixed(2)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const mm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheetWrapper: { maxHeight: '92%' },
  sheet: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    maxHeight: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  headerInfo: { flex: 1, gap: 4 },
  headerName: { fontSize: 17, fontWeight: '700', color: '#f1f5f9' },
  headerPrice: { fontSize: 20, fontWeight: '800', color: '#4ade80' },
  headerPriceExtra: { fontSize: 14, fontWeight: '500', color: '#94a3b8' },
  closeBtn: { padding: 4, marginLeft: 12 },
  closeBtnText: { fontSize: 18, color: '#64748b' },
  noModifiers: { padding: 32, alignItems: 'center' },
  noModifiersText: { color: '#64748b', fontSize: 14 },
  scroll: { flexShrink: 1 },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 8 },
  groupCard: {
    backgroundColor: '#16213e',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  groupCardError: {
    borderColor: '#f87171',
    borderWidth: 1.5,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  groupName: { fontSize: 14, fontWeight: '700', color: '#e2e8f0', flex: 1 },
  groupMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reqBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#7f1d1d44',
    borderWidth: 1,
    borderColor: '#f87171',
  },
  reqBadgeSatisfied: {
    backgroundColor: '#052e1644',
    borderColor: '#4ade80',
  },
  reqBadgeText: { fontSize: 10, fontWeight: '700', color: '#f87171', textTransform: 'uppercase' },
  reqBadgeTextSatisfied: { color: '#4ade80' },
  groupLimit: { fontSize: 11, color: '#4b5563' },
  errorText: { color: '#f87171', fontSize: 12, marginBottom: 8 },
  optionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#0f3460',
    borderWidth: 1,
    borderColor: '#1e40af',
  },
  chipSelected: {
    backgroundColor: '#4ade8022',
    borderColor: '#4ade80',
  },
  chipName: { fontSize: 13, color: '#94a3b8', fontWeight: '500' },
  chipNameSelected: { color: '#4ade80', fontWeight: '600' },
  chipDelta: { fontSize: 12, color: '#64748b' },
  chipDeltaSelected: { color: '#86efac' },
  chipCheck: { fontSize: 12, color: '#4ade80', fontWeight: '700' },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
    gap: 8,
  },
  footerError: { color: '#f87171', fontSize: 12, textAlign: 'center' },
  addBtn: {
    backgroundColor: '#4ade80',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addBtnText: { fontSize: 16, fontWeight: '800', color: '#052e16' },
});
