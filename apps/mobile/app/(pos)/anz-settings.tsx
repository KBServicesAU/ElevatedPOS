import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { confirm, toast } from '../../components/ui';

/* ------------------------------------------------------------------ */
/* Types & constants                                                   */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'elevatedpos_anz_config';

interface ANZConfig {
  merchantId: string;
  terminalId: string;
  merchantName: string;
  environment: 'production' | 'development';
  enableSurcharge: boolean;
  enableTipping: boolean;
}

const DEFAULTS: ANZConfig = {
  merchantId: '',
  terminalId: '',
  merchantName: '',
  environment: 'production',
  enableSurcharge: false,
  enableTipping: false,
};

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function ANZSettingsScreen() {
  const [config, setConfig] = useState<ANZConfig>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setConfig({ ...DEFAULTS, ...JSON.parse(raw) });
        } catch { /* ignore */ }
      }
    });
  }, []);

  async function handleSave() {
    if (!config.merchantId.trim() || !config.terminalId.trim()) {
      toast.warning('Required Fields', 'Merchant ID and Terminal ID are required.');
      return;
    }
    setSaving(true);
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(config));
      toast.success('Saved', 'ANZ Worldline settings updated.');
    } catch {
      toast.error('Error', 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    const ok = await confirm({
      title: 'Clear ANZ Settings',
      description:
        'This will clear all ANZ Worldline configuration including Merchant ID and Terminal ID.',
      confirmLabel: 'Clear',
      destructive: true,
    });
    if (!ok) return;
    setConfig(DEFAULTS);
    await SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => {});
    toast.success('Cleared', 'ANZ Worldline settings removed.');
  }

  function update(patch: Partial<ANZConfig>) {
    setConfig((c) => ({ ...c, ...patch }));
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'ANZ Worldline',
          headerStyle: { backgroundColor: '#141425' },
          headerTintColor: '#fff',
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {/* ─── Status ─────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Provider</Text>
            <Text style={styles.value}>ANZ Worldline</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor:
                    config.merchantId && config.terminalId ? '#22c55e' : '#666',
                }}
              />
              <Text
                style={[
                  styles.value,
                  {
                    color:
                      config.merchantId && config.terminalId ? '#22c55e' : '#888',
                  },
                ]}
              >
                {config.merchantId && config.terminalId
                  ? 'Configured'
                  : 'Not configured'}
              </Text>
            </View>
          </View>
          {config.merchantId ? (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.label}>Merchant ID</Text>
                <Text style={styles.value}>{config.merchantId}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.label}>Terminal ID</Text>
                <Text style={styles.value}>{config.terminalId}</Text>
              </View>
            </>
          ) : null}
        </View>

        {/* ─── Merchant Details ───────────────────── */}
        <Text style={styles.sectionTitle}>Merchant Details</Text>
        <View style={styles.card}>
          <Text style={styles.inputLabel}>Merchant Name</Text>
          <TextInput
            style={styles.input}
            value={config.merchantName}
            onChangeText={(v) => update({ merchantName: v })}
            placeholder="Your business name"
            placeholderTextColor="#555"
          />

          <Text style={[styles.inputLabel, { marginTop: 14 }]}>
            Merchant ID *
          </Text>
          <TextInput
            style={styles.input}
            value={config.merchantId}
            onChangeText={(v) => update({ merchantId: v })}
            placeholder="Provided by ANZ"
            placeholderTextColor="#555"
            autoCorrect={false}
            autoCapitalize="none"
          />

          <Text style={[styles.inputLabel, { marginTop: 14 }]}>
            Terminal ID *
          </Text>
          <TextInput
            style={styles.input}
            value={config.terminalId}
            onChangeText={(v) => update({ terminalId: v })}
            placeholder="Provided by ANZ"
            placeholderTextColor="#555"
            autoCorrect={false}
            autoCapitalize="none"
          />

          <Text style={styles.hint}>
            These details are available in your ANZ Worldline merchant portal or by
            contacting ANZ Merchant Services on 1800 039 025.
          </Text>
        </View>

        {/* ─── Environment ────────────────────────── */}
        <Text style={styles.sectionTitle}>Environment</Text>
        <View style={styles.card}>
          {(
            [
              {
                value: 'production' as const,
                label: 'Production',
                hint: 'Live payments. Use with a real terminal.',
              },
              {
                value: 'development' as const,
                label: 'Development / UAT',
                hint: 'Test environment. No real funds are taken.',
              },
            ] as const
          ).map((env) => (
            <TouchableOpacity
              key={env.value}
              style={[
                styles.envOption,
                config.environment === env.value && styles.envOptionActive,
              ]}
              onPress={() => update({ environment: env.value })}
              activeOpacity={0.85}
            >
              <View style={styles.envLeft}>
                <Ionicons
                  name={
                    config.environment === env.value
                      ? 'radio-button-on'
                      : 'radio-button-off'
                  }
                  size={20}
                  color={config.environment === env.value ? '#6366f1' : '#555'}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.envLabel}>{env.label}</Text>
                  <Text style={styles.envHint}>{env.hint}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── Transaction Options ─────────────────── */}
        <Text style={styles.sectionTitle}>Transaction Options</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Surcharging</Text>
              <Text style={styles.toggleHint}>
                Apply the merchant's configured surcharge to card payments.
              </Text>
            </View>
            <Switch
              value={config.enableSurcharge}
              onValueChange={(v) => update({ enableSurcharge: v })}
              trackColor={{ true: '#6366f1', false: '#2a2a3a' }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Tipping</Text>
              <Text style={styles.toggleHint}>
                Prompt for a tip on the terminal during a purchase.
              </Text>
            </View>
            <Switch
              value={config.enableTipping}
              onValueChange={(v) => update({ enableTipping: v })}
              trackColor={{ true: '#6366f1', false: '#2a2a3a' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* ─── Save ───────────────────────────────── */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Ionicons name="save-outline" size={16} color="#fff" />
          <Text style={styles.primaryBtnText}>
            {saving ? 'Saving…' : 'Save Settings'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dangerBtn}
          onPress={handleClear}
          activeOpacity={0.85}
        >
          <Ionicons name="trash-outline" size={16} color="#ef4444" />
          <Text style={styles.dangerBtnText}>Clear ANZ Settings</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  sectionTitle: {
    color: '#888',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#141425',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e1e2e',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  label: { color: '#888', fontSize: 13, fontWeight: '600' },
  value: { color: '#fff', fontSize: 13, fontWeight: '600' },
  hint: { color: '#555', fontSize: 11, marginTop: 10, lineHeight: 15 },
  divider: { height: 1, backgroundColor: '#1e1e2e', marginVertical: 8 },
  inputLabel: { color: '#888', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  input: {
    backgroundColor: '#0f0f1a',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
  },
  envOption: { borderRadius: 8, paddingVertical: 8 },
  envOptionActive: { backgroundColor: 'rgba(99,102,241,0.08)' },
  envLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  envLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  envHint: { color: '#666', fontSize: 11, marginTop: 2 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 12 },
  toggleLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  toggleHint: { color: '#666', fontSize: 11, marginTop: 2 },
  primaryBtn: {
    marginTop: 24,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  dangerBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dangerBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 13 },
});
