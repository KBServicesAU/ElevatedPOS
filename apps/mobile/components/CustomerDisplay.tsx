import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { useCustomerDisplayStore } from '../store/customer-display';

/* ------------------------------------------------------------------ */
/* Customer-Facing Display Component                                   */
/*                                                                     */
/* Renders the content for the secondary screen (iMin Swan dual-screen */
/* connected via HDMI/DisplayPort). Three phases:                      */
/*   idle        — logo + welcome message                              */
/*   transaction — live cart: line items, totals, GST                  */
/*   thankyou    — order complete message                              */
/*                                                                     */
/* This component is rendered via Android's Presentation API on the    */
/* external display. On single-screen devices with the setting enabled */
/* it can be shown as a slide-over panel for testing.                  */
/* ------------------------------------------------------------------ */

export default function CustomerDisplay() {
  const { settings, phase, transaction } = useCustomerDisplayStore();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [phase]);

  if (!settings.enabled) return null;

  /* ── Idle phase ─────────────────────────────────────────────────── */
  if (phase === 'idle') {
    return (
      <View style={s.container}>
        <Animated.View
          style={[
            s.idleWrap,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {settings.showLogo && (
            <View style={s.logoWrap}>
              <View style={s.logoCircle}>
                <Text style={s.logoText}>E</Text>
              </View>
              <Text style={s.brandName}>ElevatedPOS</Text>
            </View>
          )}
          <Text style={s.welcomeText}>{settings.welcomeMessage}</Text>
        </Animated.View>
      </View>
    );
  }

  /* ── Thank-you phase ────────────────────────────────────────────── */
  if (phase === 'thankyou') {
    return (
      <View style={s.container}>
        <Animated.View
          style={[
            s.thankYouWrap,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={s.checkCircle}>
            <Text style={s.checkMark}>✓</Text>
          </View>
          <Text style={s.thankYouTitle}>{settings.thankYouMessage}</Text>
          {transaction.total > 0 && (
            <Text style={s.thankYouTotal}>
              Total: ${transaction.total.toFixed(2)}
            </Text>
          )}
        </Animated.View>
      </View>
    );
  }

  /* ── Transaction phase ──────────────────────────────────────────── */
  return (
    <View style={s.container}>
      <Animated.View
        style={[
          s.txWrap,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Header */}
        <View style={s.txHeader}>
          <Text style={s.txHeaderTitle}>Your Order</Text>
          {transaction.customerName && (
            <Text style={s.txCustomer}>{transaction.customerName}</Text>
          )}
          <Text style={s.txItemCount}>
            {transaction.itemCount} {transaction.itemCount === 1 ? 'item' : 'items'}
          </Text>
        </View>

        {/* Line items */}
        {settings.showLineItems && (
          <View style={s.itemsWrap}>
            {transaction.items.map((item, i) => (
              <View key={i} style={s.itemRow}>
                <View style={s.itemLeft}>
                  <Text style={s.itemQty}>{item.qty}x</Text>
                  <Text style={s.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>
                <Text style={s.itemPrice}>
                  ${(item.price * item.qty).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Divider */}
        <View style={s.divider} />

        {/* Totals */}
        <View style={s.totalsWrap}>
          {settings.showGst && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Incl. GST</Text>
              <Text style={s.totalValue}>
                ${transaction.gst.toFixed(2)}
              </Text>
            </View>
          )}
          <View style={s.grandRow}>
            <Text style={s.grandLabel}>Total</Text>
            <Text style={s.grandValue}>
              ${transaction.total.toFixed(2)}
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a14',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },

  /* ── Idle ── */
  idleWrap: { alignItems: 'center', gap: 24 },
  logoWrap: { alignItems: 'center', gap: 14 },
  logoCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  logoText: { fontSize: 40, fontWeight: '900', color: '#fff' },
  brandName: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  welcomeText: { fontSize: 22, color: '#666', fontWeight: '500' },

  /* ── Thank you ── */
  thankYouWrap: { alignItems: 'center', gap: 20 },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  checkMark: { fontSize: 40, color: '#fff', fontWeight: '900' },
  thankYouTitle: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center' },
  thankYouTotal: { fontSize: 20, fontWeight: '700', color: '#6366f1' },

  /* ── Transaction ── */
  txWrap: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#111122',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1e1e2e',
    overflow: 'hidden',
  },
  txHeader: {
    backgroundColor: '#141430',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  txHeaderTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  txCustomer: { fontSize: 14, color: '#6366f1', fontWeight: '600', marginTop: 4 },
  txItemCount: { fontSize: 13, color: '#555', marginTop: 4 },

  itemsWrap: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    maxHeight: 320,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2a',
  },
  itemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  itemQty: { fontSize: 15, fontWeight: '800', color: '#6366f1', minWidth: 28 },
  itemName: { fontSize: 15, color: '#ccc', fontWeight: '500', flex: 1 },
  itemPrice: { fontSize: 15, color: '#999', fontWeight: '600' },

  divider: { height: 1, backgroundColor: '#2a2a3a', marginHorizontal: 24 },

  totalsWrap: { paddingHorizontal: 24, paddingVertical: 16, gap: 8 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { fontSize: 14, color: '#666' },
  totalValue: { fontSize: 14, color: '#888' },
  grandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  grandLabel: { fontSize: 24, fontWeight: '900', color: '#fff' },
  grandValue: { fontSize: 28, fontWeight: '900', color: '#6366f1' },
});
