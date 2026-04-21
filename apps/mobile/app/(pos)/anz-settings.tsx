import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useAnzStore, type AnzConfig } from '../../store/anz';
import { useAnzBridge, type AnzCapabilities } from '../../components/AnzBridgeHost';
import { confirm, toast } from '../../components/ui';

/* ------------------------------------------------------------------ */
/* Capability row — read-only informational row                        */
/* ------------------------------------------------------------------ */

function CapabilityRow({
  label,
  hint,
  capabilities,
  flag,
}: {
  label: string;
  hint: string;
  capabilities: AnzCapabilities | null;
  flag: keyof AnzCapabilities;
}) {
  // Three states:
  //   null (till not open yet)    → show em-dash + "Available after opening the till"
  //   capabilities[flag] === true → green check + "Enabled by ANZ"
  //   capabilities[flag] === false→ grey dash + "Not configured"
  let statusIcon: keyof typeof Ionicons.glyphMap;
  let statusColor: string;
  let statusText: string;
  if (capabilities === null) {
    statusIcon = 'remove-outline';
    statusColor = '#555';
    statusText = 'Available after opening the till';
  } else if (capabilities[flag]) {
    statusIcon = 'checkmark-circle';
    statusColor = '#22c55e';
    statusText = 'Enabled by ANZ';
  } else {
    statusIcon = 'remove-circle-outline';
    statusColor = '#555';
    statusText = 'Not configured';
  }

  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleHint}>{hint}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 160 }}>
        <Ionicons name={statusIcon} size={16} color={statusColor} />
        <Text style={[styles.capabilityStatus, { color: statusColor }]} numberOfLines={2}>
          {statusText}
        </Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function ANZSettingsScreen() {
  const { config, ready, hydrate, setConfig, clearConfig } = useAnzStore();
  const [local, setLocal] = useState<AnzConfig>(config);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // v2.7.23 — real terminal capability bits. Null until the till is
  // opened; thereafter reflects what the acquirer-level merchant config
  // allows (surcharging, tipping, cashback). Replaces the old local
  // zustand toggle that nothing read.
  const bridgeCapabilities = useAnzBridge().capabilities;

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

  function handleTestConnection() {
    // Real connectivity is tested by the "Pair Terminal" button below, which
    // runs the full TIM API lifecycle against the terminal. Doing a secondary
    // HTTP reachability probe here was the cause of an iMin app crash —
    // hitting the terminal's WebSocket port with fetch() and then trying to
    // parse the response blew up somewhere in the iMin's old fetch
    // implementation. We now do local-only input validation so the button
    // still gives the user feedback without any network I/O.
    setTesting(true);
    try {
      const ip   = local.terminalIp.trim();
      const port = local.terminalPort;
      if (!ip) {
        toast.warning('Required', 'Enter the terminal IP address first.');
        return;
      }
      // Basic IPv4 format check — must be four 0-255 octets separated by dots.
      const ipv4 = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/;
      if (!ipv4.test(ip)) {
        toast.error('Invalid IP', `"${ip}" is not a valid IPv4 address.`);
        return;
      }
      if (!port || port < 1 || port > 65535) {
        toast.error('Invalid Port', `Port must be between 1 and 65535 (TIM API default is 7784).`);
        return;
      }
      toast.success('Looks good', `Settings are valid. Use "Pair Terminal" to actually connect to ${ip}:${port}.`);
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
    setLocal({ merchantId: '', terminalId: '', merchantName: '', environment: 'production', terminalIp: '', terminalPort: 7784 });
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
                <Text style={styles.value}>{config.terminalIp}:{config.terminalPort || 7784}</Text>
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
            value={String(local.terminalPort || 7784)}
            onChangeText={(v) => update({ terminalPort: parseInt(v) || 7784 })}
            placeholder="7784"
            placeholderTextColor="#555"
            keyboardType="number-pad"
          />

          <Text style={styles.hint}>
            The ANZ terminal's local IP address and TIM API port (default 7784). The device
            must be on the same Wi-Fi network as the terminal.
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
              {testing ? 'Checking…' : 'Validate Settings'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.hint}>
            To actually connect the terminal, use <Text style={{ color: '#a5b4fc', fontWeight: '700' }}>Open Till</Text> from the More menu.
            That runs the Connect → Login → Activate lifecycle and keeps the
            terminal online for the rest of the shift.
          </Text>
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

        {/* ─── Terminal Capabilities ──────────────── */}
        {/*
          v2.7.23 — these rows are read-only. The TIM API Terminal reports
          canSurcharge / canTip / canCashback via capability bits after
          `activateCompleted`, driven by the acquirer-level merchant
          config on ANZ's side. Previously this section held Switch
          toggles that wrote to a local zustand store but nothing read
          them — cosmetic only. Now they reflect the true terminal state.
        */}
        <Text style={styles.sectionTitle}>Terminal Capabilities</Text>
        <View style={styles.card}>
          <CapabilityRow
            label="Surcharging"
            hint="Apply the merchant's configured surcharge to card payments."
            capabilities={bridgeCapabilities}
            flag="canSurcharge"
          />
          <View style={styles.divider} />
          <CapabilityRow
            label="Tipping"
            hint="Prompt for a tip on the terminal during a purchase."
            capabilities={bridgeCapabilities}
            flag="canTip"
          />
          <View style={styles.divider} />
          <CapabilityRow
            label="Cashback"
            hint="Allow the cardholder to withdraw cash with their purchase."
            capabilities={bridgeCapabilities}
            flag="canCashback"
          />
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
  capabilityStatus: { fontSize: 11, fontWeight: '700', textAlign: 'right' },
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
