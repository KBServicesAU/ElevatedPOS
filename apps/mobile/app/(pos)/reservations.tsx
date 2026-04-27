/**
 * v2.7.51 — Reservations placeholder. Hospitality merchants see this tab
 * via the industry-gated sidebar (see store/sidebar.ts requiresIndustry).
 * The full booking UI is managed from the dashboard for now; this screen
 * exists so the menu entry has somewhere to land.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ReservationsScreen() {
  return (
    <View style={styles.root}>
      <View style={styles.iconWrap}>
        <Ionicons name="calendar" size={48} color="#6366f1" />
      </View>
      <Text style={styles.title}>Reservations</Text>
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
