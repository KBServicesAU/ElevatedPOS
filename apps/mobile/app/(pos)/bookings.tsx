/**
 * v2.7.51 — Bookings placeholder. Services merchants (salons, clinics,
 * trades) see this tab via the industry-gated sidebar (see
 * store/sidebar.ts requiresIndustry). Appointment booking ships
 * separately; this screen makes the menu entry route somewhere.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function BookingsScreen() {
  return (
    <View style={styles.root}>
      <View style={styles.iconWrap}>
        <Ionicons name="time" size={48} color="#f59e0b" />
      </View>
      <Text style={styles.title}>Bookings</Text>
      <Text style={styles.subtitle}>Coming soon — manage from dashboard</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0d0d14',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: '#141425',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: { fontSize: 24, fontWeight: '900', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#94a3b8', fontWeight: '600' },
});
