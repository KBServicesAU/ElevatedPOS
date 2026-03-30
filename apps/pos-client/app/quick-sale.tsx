import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// ─── Calculator Keys ───────────────────────────────────────────────────────────

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
];

// ─── Quick Amount Presets ──────────────────────────────────────────────────────

const QUICK_AMOUNTS = [5, 10, 20, 50];

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function QuickSaleScreen() {
  const router = useRouter();

  const [amountStr, setAmountStr] = useState('0');
  const [description, setDescription] = useState('');

  // ── Amount helpers ─────────────────────────────────────────────────────────

  const pressKey = useCallback((key: string) => {
    setAmountStr((prev) => {
      if (key === '⌫') {
        if (prev.length <= 1) return '0';
        const next = prev.slice(0, -1);
        return next === '' ? '0' : next;
      }
      if (key === '.') {
        if (prev.includes('.')) return prev;
        return prev + '.';
      }
      // Numeric digit
      if (prev === '0') return key;
      // Limit to 2 decimal places
      const dotIdx = prev.indexOf('.');
      if (dotIdx !== -1 && prev.length - dotIdx > 2) return prev;
      return prev + key;
    });
  }, []);

  const setPreset = (amount: number) => {
    setAmountStr(amount.toFixed(2));
  };

  const amount = parseFloat(amountStr) || 0;
  const canCharge = amount > 0;

  // ── Proceed to payment ─────────────────────────────────────────────────────

  const handleCharge = () => {
    if (!canCharge) {
      Alert.alert('Invalid Amount', 'Please enter a sale amount.');
      return;
    }

    const desc = description.trim() || 'Quick Sale';
    const subtotal = amount;
    const tax = subtotal * 0.1;
    const total = subtotal + tax;

    const items = JSON.stringify([
      {
        id: `qs-${Date.now()}`,
        name: desc,
        price: subtotal,
        qty: 1,
      },
    ]);

    router.push({
      pathname: '/payment',
      params: {
        items,
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2),
      },
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#60a5fa" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Quick Sale</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Amount display */}
      <View style={s.amountDisplay}>
        <Text style={s.amountCurrency}>$</Text>
        <Text style={s.amountValue} adjustsFontSizeToFit numberOfLines={1}>
          {amountStr}
        </Text>
      </View>

      {/* Quick presets */}
      <View style={s.presetsRow}>
        {QUICK_AMOUNTS.map((a) => (
          <TouchableOpacity
            key={a}
            style={s.presetBtn}
            onPress={() => setPreset(a)}
          >
            <Text style={s.presetBtnText}>${a}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Description field */}
      <View style={s.descContainer}>
        <Ionicons name="create-outline" size={16} color="#64748b" style={s.descIcon} />
        <TextInput
          style={s.descInput}
          placeholder="Description (e.g. Delivery fee, Service charge)"
          placeholderTextColor="#4b5563"
          value={description}
          onChangeText={setDescription}
          returnKeyType="done"
          maxLength={80}
        />
        {description.length > 0 && (
          <TouchableOpacity onPress={() => setDescription('')} style={s.descClear}>
            <Ionicons name="close-circle" size={16} color="#4b5563" />
          </TouchableOpacity>
        )}
      </View>

      {/* Calculator pad */}
      <View style={s.pad}>
        {KEYS.map((row, ri) => (
          <View key={ri} style={s.padRow}>
            {row.map((key) => (
              <TouchableOpacity
                key={key}
                style={[s.padKey, key === '⌫' && s.padKeyBackspace]}
                onPress={() => pressKey(key)}
                activeOpacity={0.6}
              >
                {key === '⌫' ? (
                  <Ionicons name="backspace-outline" size={22} color="#94a3b8" />
                ) : (
                  <Text style={s.padKeyText}>{key}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>

      {/* Tax note + Charge button */}
      <View style={s.footer}>
        {amount > 0 && (
          <View style={s.taxNote}>
            <Text style={s.taxNoteText}>
              Subtotal ${amount.toFixed(2)}  ·  GST ${(amount * 0.1).toFixed(2)}  ·  Total ${(amount * 1.1).toFixed(2)}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[s.chargeBtn, !canCharge && s.chargeBtnDisabled]}
          onPress={handleCharge}
          disabled={!canCharge}
        >
          <Ionicons name="flash" size={20} color="#052e16" />
          <Text style={s.chargeBtnText}>
            {canCharge ? `Charge $${(amount * 1.1).toFixed(2)}` : 'Enter Amount'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  backBtn: { width: 36 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#f1f5f9' },

  amountDisplay: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 4,
  },
  amountCurrency: {
    fontSize: 32,
    color: '#64748b',
    fontWeight: '300',
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 72,
    fontWeight: '800',
    color: '#f1f5f9',
    minWidth: 80,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },

  presetsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  presetBtn: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  presetBtnText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },

  descContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    backgroundColor: '#16213e',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#0f3460',
    marginBottom: 16,
  },
  descIcon: { marginRight: 8 },
  descInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: '#f1f5f9',
  },
  descClear: { padding: 4 },

  pad: {
    flex: 1,
    paddingHorizontal: 16,
    gap: 8,
  },
  padRow: { flexDirection: 'row', gap: 8 },
  padKey: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  padKeyBackspace: { backgroundColor: '#1a1a2e' },
  padKeyText: { fontSize: 24, fontWeight: '500', color: '#f1f5f9' },

  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
  },
  taxNote: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  taxNoteText: { color: '#64748b', fontSize: 12 },
  chargeBtn: {
    backgroundColor: '#4ade80',
    borderRadius: 14,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  chargeBtnDisabled: { backgroundColor: '#166534', opacity: 0.5 },
  chargeBtnText: { color: '#052e16', fontSize: 18, fontWeight: '800' },
});
