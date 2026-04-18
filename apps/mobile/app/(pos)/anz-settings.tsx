import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { useAnzStore, type AnzConfig } from '../../store/anz';
import { confirm, toast } from '../../components/ui';

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function ANZSettingsScreen() {
  const { config, ready, hydrate, setConfig, clearConfig } = useAnzStore();
  const [local, setLocal] = useState<AnzConfig>(config);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    hydrate();
  }, []);

  // Sync local form state when store hydrates
  useEffect(() => {
    if (ready) setLocal(config);
  }, [ready]);

  function update(patch: Partial<AnzConfig>) {
    setLocal((c) => ({ ...c, ...patch }));
  }

  async function handleSave() {
    if (!local.terminalIp.trim()) {
      toast.warning('Required', 'Terminal IP address is required to process payments.');
      return;
    }
    setSaving(true);
    try {
      await setConfig(local);
      toast.success('Saved', 'ANZ Worldline settings updated.');
    } catch {
      toast.error('Error', 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    if (!local.terminalIp.trim()) {
      toast.warning('Required', 'Enter the terminal IP address first.');
      return;
    }
    setTesting(true);
    try {
      const port = local.terminalPort || 8080;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`http://${local.terminalIp.trim()}:${port}/v1/status`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json().catch(() => ({})) as { status?: string; terminalId?: string };
        const detail = data.status ? `Status: ${data.status}` : 'Terminal responded.';
        toast.success('Connected', detail);
      } else {
        toast.warning('Unreachable', `Terminal returned HTTP ${res.status}.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('abort') || msg.includes('timeout')) {
        toast.error('Timeout', 'No response from terminal. Check the IP and that the device is on the same network.');
      } else {
        toast.error('Connection Failed', msg);
      }
    } finally {
      setTesting(false);
    }
  }

  async function handleClear() {
    const ok = await confirm({
      title: 'Clear ANZ Settings',
      description:
        'This will clear all ANZ Worldline configuration including the terminal IP address.',
      confirmLabel: 'Clear',
      destructive: true,
    });
    if (!ok) return;
    await clearConfig();
    setLocal({ merchantId: '', terminalId: '', merchantName: '', environment: 'production', enableSurcharge: false, enableTipping: false, terminalIp: '', terminalPort: 8080 });
    toast.success('Cleared', 'ANZ Worldline settings removed.');
  }

  const isConfigured = !!config.terminalIp.trim();

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
            <Text style={styles.value}>ANZ Worldline TIM</Text>
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
                  backgroundColor: isConfigured ? '#22c55e' : '#666',
                }}
              />
              <Text style={[styles.value, { color: isConfigured ? '#22c55e' : '#888' }]}>
                {isConfigured ? 'Configured' : 'Not configured'}
              </Text>
            </View>
          </View>
          {isConfigured && (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.label}>Terminal IP</Text>
                <Text style={styles.value}>{config.terminalIp}:{config.terminalPort || 8080}</Text>
              </View>
            </>
          )}
        </View>

        {/* ─── Terminal Connection ─────────────────── */}
        <Text style={styles.sectionTitle}>Terminal Connection</Text>
        <View style={styles.card}>
          <Text style={styles.inputLabel}>Terminal IP Address *</Text>
          <TextInput
            style={styles.input}
            value={local.terminalIp}
            onChangeText={(v) => update({ terminalIp: v })}
            placeholder="e.g. 192.168.1.100"
            placeholderTextColor="#555"
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType="decimal-pad"
          />

          <Text style={[styles.inputLabel, { marginTop: 14 }]}>Terminal Port</Text>
          <TextInput
            style={styles.input}
            value={String(local.terminalPort || 8080)}
            onChangeText={(v) => update({ terminalPort: parseInt(v) || 8080 })}
            placeholder="8080"
            placeholderTextColor="#555"
            keyboardType="number-pad"
          />

          <Text style={styles.hint}>
            The ANZ terminal's local IP address and HTTP port. The device must be on the same
            Wi-Fi network as the terminal.
          </Text>

          <TouchableOpacity
            style={[styles.testBtn, testing && { opacity: 0.6 }]}
            onPress={handleTestConnection}
            disabled={testing}
            activeOpacity={0.8}
          >
            {testing ? (
              <ActivityIndicator size="small" color="#6366f1" />
            ) : (
              <Ionicons name="wifi-outline" size={15} color="#6366f1" />
            )}
            <Text style={styles.testBtnText}>
              {testing ? 'Testing…' : 'Test Connection'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ─── Merchant Details ───────────────────── */}
        <Text style={styles.sectionTitle}>Merchant Details</Text>
        <View style={styles.card}>
          <Text style={styles.inputLabel}>Merchant Name</Text>
          <TextInput
            style={styles.input}
            value={local.merchantName}
            onChangeText={(v) => update({ merchantName: v })}
            placeholder="Your business name"
            placeholderTextColor="#555"
          />

          <Text style={[styles.inputLabel, { marginTop: 14 }]}>Merchant ID</Text>
          <TextInput
            style={styles.input}
            value={local.merchantId}
            onChangeText={(v) => update({ merchantId: v })}
            placeholder="Provided by ANZ (optional)"
            placeholderTextColor="#555"
            autoCorrect={false}
            autoCapitalize="none"
          />

          <Text style={[styles.inputLabel, { marginTop: 14 }]}>Terminal ID</Text>
          <TextInput
            style={styles.input}
            value={local.terminalId}
            onChangeText={(v) => update({ terminalId: v })}
            placeholder="Provided by ANZ (optional)"
            placeholderTextColor="#555"
            autoCorrect={false}
            autoCapitalize="none"
          />

          <Text style={styles.hint}>
            Merchant ID and Terminal ID are optional — they are recorded with orders for reporting
            but are not required for payment processing.
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
                hint: 'Live payments. Use with a real ANZ terminal.',
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
                local.environment === env.value && styles.envOptionActive,
              ]}
              onPress={() => update({ environment: env.value })}
              activeOpacity={0.85}
            >
              <View style={styles.envLeft}>
                <Ionicons
                  name={
                    local.environment === env.value
                      ? 'radio-button-on'
                      : 'radio-button-off'
                  }
                  size={20}
                  color={local.environment === env.value ? '#6366f1' : '#555'}
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
              value={local.enableSurcharge}
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
              value={local.enableTipping}
              onValueChange={(v) => update({ enableTipping: v })}
              trackColor={{ true: '#6366f1', false: '#2a2a3a' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* ─── Save ───────────────────────────────── */}
        <TouchableOpacity
          style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
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
  testBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#6366f1',
    borderRadius: 10,
    paddingVertical: 10,
  },
  testBtnText: { color: '#6366f1', fontWeight: '700', fontSize: 13 },
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
