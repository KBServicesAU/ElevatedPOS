import React, { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  Platform,
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
import Constants from 'expo-constants';
import {
  initTyro,
  isTyroInitialized,
  addTyroListener,
  tyroGetConfiguration,
  tyroManualSettlement,
  tyroReconciliationReport,
  type TyroEnvironment,
} from '../../modules/tyro-tta';
import { useTyroStore } from '../../store/tyro';
import { TyroPairingModal } from '../../components/TyroPairingModal';
import { toast, confirm } from '../../components/ui';

/**
 * Tyro EFTPOS settings screen.
 *
 * Meets cert requirements from the "Tyro Settings Page" and
 * "API Key configuration" test sheets:
 *   - Displays POS product info (vendor / name / version) for Tyro Support.
 *   - Lets the merchant enter/update the API key and switch environments.
 *   - Initiates pairing via a custom POS UI (no Tyro default pairing page).
 *   - Exposes the iClient logs page for diagnostics.
 *   - Toggles integrated receipts, surcharge, cashout and tipping.
 */

const POS_VENDOR = 'ElevatedPOS';
const POS_PRODUCT_NAME = 'ElevatedPOS Mobile POS';
const POS_PRODUCT_VERSION = Constants.expoConfig?.version ?? '1.0.0';

const ENV_LABELS: Record<TyroEnvironment, { label: string; hint: string }> = {
  simulator: {
    label: 'Simulator',
    hint: 'No physical terminal required. Good for development and demos.',
  },
  test: {
    label: 'Test (pre-production)',
    hint: 'Use with a test terminal issued by Tyro during certification.',
  },
  production: {
    label: 'Production',
    hint: 'Live payments. Only use after certification is complete.',
  },
};

const LOG_URLS: Record<TyroEnvironment, string> = {
  simulator: 'https://iclientsimulator.test.tyro.com/logs.html#expert',
  test: 'https://iclient.test.tyro.com/logs.html#expert',
  production: 'https://iclient.tyro.com/logs.html#expert',
};

export default function TyroSettingsScreen() {
  const { config, hydrate, setConfig } = useTyroStore();

  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [showPairing, setShowPairing] = useState(false);
  const [initStatus, setInitStatus] = useState<'idle' | 'initializing' | 'ready' | 'error'>('idle');
  const [initError, setInitError] = useState<string | null>(null);
  const [techTapCount, setTechTapCount] = useState(0);
  const [techMode, setTechMode] = useState(false);

  // ── Hydrate persisted config on mount ───────────────────────────
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    setApiKeyDraft(config.apiKey);
  }, [config.apiKey]);

  // ── Subscribe to init / ready events ────────────────────────────
  useEffect(() => {
    const subReady = addTyroListener('onReady', () => {
      setInitStatus('ready');
      setInitError(null);
    });
    const subErr = addTyroListener('onInitError', (e) => {
      setInitStatus('error');
      setInitError(e.message || 'Failed to initialise Tyro SDK');
    });
    return () => {
      subReady.remove();
      subErr.remove();
    };
  }, []);

  // ── Persist-then-init helper ────────────────────────────────────
  const applyAndInit = useCallback(async () => {
    const trimmed = apiKeyDraft.trim();
    if (!trimmed) {
      toast.warning('API Key Required', 'Enter the API key supplied by Tyro before initialising.');
      return;
    }
    await setConfig({ apiKey: trimmed });
    setInitStatus('initializing');
    setInitError(null);
    try {
      initTyro(trimmed, config.environment, POS_PRODUCT_VERSION);
      toast.info('Initialising', 'Connecting to the Tyro SDK…');
    } catch (err) {
      setInitStatus('error');
      const message = err instanceof Error ? err.message : 'Failed to initialise Tyro SDK';
      setInitError(message);
      toast.error('Init Failed', message);
    }
  }, [apiKeyDraft, config.environment, setConfig]);

  const handleEnvironmentChange = useCallback(
    async (env: TyroEnvironment) => {
      if (env === config.environment) return;
      await setConfig({ environment: env });
      // Re-init if we already had a key configured
      if (config.apiKey) {
        setInitStatus('initializing');
        setInitError(null);
        try {
          initTyro(config.apiKey, env, POS_PRODUCT_VERSION);
        } catch (err) {
          setInitStatus('error');
          setInitError(err instanceof Error ? err.message : 'Failed to initialise Tyro SDK');
        }
      }
    },
    [config.apiKey, config.environment, setConfig],
  );

  const openLogs = useCallback(() => {
    const url = LOG_URLS[config.environment];
    Linking.openURL(url).catch(() => {
      toast.error('Unable to open logs', `Visit ${url} in a browser to view the Tyro logs.`);
    });
  }, [config.environment]);

  const statusColor = (() => {
    if (initStatus === 'ready' || isTyroInitialized()) return '#22c55e';
    if (initStatus === 'error') return '#ef4444';
    if (initStatus === 'initializing') return '#f59e0b';
    return '#666';
  })();

  const statusLabel = (() => {
    if (initStatus === 'ready' || isTyroInitialized()) return 'Connected';
    if (initStatus === 'error') return 'Error';
    if (initStatus === 'initializing') return 'Initialising…';
    return 'Not connected';
  })();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Tyro EFTPOS',
          headerStyle: { backgroundColor: '#141425' },
          headerTintColor: '#fff',
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {/* ─── Status card ───────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Provider</Text>
            <Text style={styles.value}>Tyro EFTPOS</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.value, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
          {initError ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.errorText} numberOfLines={3}>
                {initError}
              </Text>
            </>
          ) : null}
        </View>

        {/* ─── POS product info ───────────────────────── */}
        <TouchableOpacity
          onPress={() => {
            const next = techTapCount + 1;
            setTechTapCount(next);
            if (next >= 5) {
              setTechMode(true);
              setTechTapCount(0);
            }
          }}
          activeOpacity={1}
        >
          <Text style={styles.sectionTitle}>
            POS Product Info{techMode ? '  🔓' : ''}
          </Text>
        </TouchableOpacity>
        {!techMode && (
          <Text style={{ color: '#333', fontSize: 10, marginBottom: 8, marginLeft: 4 }}>
            Advanced configuration is hidden. Contact your installer for access.
          </Text>
        )}
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Vendor</Text>
            <Text style={styles.value}>{POS_VENDOR}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Product name</Text>
            <Text style={styles.value}>{POS_PRODUCT_NAME}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Version</Text>
            <Text style={styles.value}>{POS_PRODUCT_VERSION}</Text>
          </View>
          <Text style={styles.hint}>
            This information is sent to Tyro with every transaction and must match what was
            submitted for certification.
          </Text>
        </View>

        {/* ─── API Key (Technician Access) ─────────── */}
        {techMode && (
          <>
            <Text style={styles.sectionTitle}>API Key</Text>
            <View style={styles.card}>
              <Text style={styles.label}>Tyro API key</Text>
              <TextInput
                style={styles.input}
                value={apiKeyDraft}
                onChangeText={setApiKeyDraft}
                placeholder="Paste your Tyro API key"
                placeholderTextColor="#555"
                autoCorrect={false}
                autoCapitalize="none"
                secureTextEntry
              />
              <Text style={styles.hint}>
                Issued by Tyro during POS integration onboarding. Keep it secret.
              </Text>

              <TouchableOpacity style={styles.primaryBtn} onPress={applyAndInit} activeOpacity={0.85}>
                <Ionicons name="flash" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>
                  {initStatus === 'ready' || isTyroInitialized() ? 'Re-initialise SDK' : 'Initialise SDK'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ─── Environment ───────────────────────────── */}
        <Text style={styles.sectionTitle}>Environment</Text>
        <View style={styles.card}>
          {(Object.keys(ENV_LABELS) as TyroEnvironment[]).map((env) => {
            const active = config.environment === env;
            return (
              <TouchableOpacity
                key={env}
                style={[styles.envOption, active && styles.envOptionActive]}
                onPress={() => handleEnvironmentChange(env)}
                activeOpacity={0.85}
              >
                <View style={styles.envLeft}>
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={active ? '#6366f1' : '#555'}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.envLabel}>{ENV_LABELS[env].label}</Text>
                    <Text style={styles.envHint}>{ENV_LABELS[env].hint}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ─── Pairing ───────────────────────────────── */}
        <Text style={styles.sectionTitle}>Terminal Pairing</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Merchant ID</Text>
            <Text style={styles.value}>{config.mid || '—'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Terminal ID</Text>
            <Text style={styles.value}>{config.tid || '—'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Integration key</Text>
            <Text style={styles.value}>{config.integrationKeyMask || 'Not paired'}</Text>
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              if (!isTyroInitialized()) {
                toast.warning(
                  'Not initialised',
                  'Enter your API key and tap Initialise SDK first.',
                );
                return;
              }
              setShowPairing(true);
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="link" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Pair Terminal</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => {
              if (!isTyroInitialized()) return;
              tyroGetConfiguration();
              toast.info(
                'Configuration requested',
                'See logs for the current terminal configuration.',
              );
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="information-circle-outline" size={16} color="#ccc" />
            <Text style={styles.secondaryBtnText}>Get Current Configuration</Text>
          </TouchableOpacity>
        </View>

        {/* ─── Receipt / surcharge / tipping toggles ─── */}
        <Text style={styles.sectionTitle}>Transaction Options</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Integrated receipts</Text>
              <Text style={styles.toggleHint}>
                Merchant receipts are rendered by the POS, not the terminal.
              </Text>
            </View>
            <Switch
              value={config.integratedReceipts}
              onValueChange={(v) => setConfig({ integratedReceipts: v })}
              trackColor={{ true: '#6366f1', false: '#2a2a3a' }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Surcharging</Text>
              <Text style={styles.toggleHint}>
                Tyro applies the merchant's configured surcharge to each sale.
              </Text>
            </View>
            <Switch
              value={config.enableSurcharge}
              onValueChange={(v) => setConfig({ enableSurcharge: v })}
              trackColor={{ true: '#6366f1', false: '#2a2a3a' }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Tipping</Text>
              <Text style={styles.toggleHint}>
                Prompt for a tip amount on the terminal during a purchase.
              </Text>
            </View>
            <Switch
              value={config.tippingEnabled}
              onValueChange={(v) => setConfig({ tippingEnabled: v })}
              trackColor={{ true: '#6366f1', false: '#2a2a3a' }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Cashout</Text>
              <Text style={styles.toggleHint}>
                Allow the merchant to dispense cash alongside a purchase.
              </Text>
            </View>
            <Switch
              value={config.cashoutEnabled}
              onValueChange={(v) => setConfig({ cashoutEnabled: v })}
              trackColor={{ true: '#6366f1', false: '#2a2a3a' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* ─── Reconciliation / Settlement ──────────── */}
        <Text style={styles.sectionTitle}>Reconciliation & Settlement</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={async () => {
              if (!isTyroInitialized()) {
                toast.warning('Not initialised', 'Initialise the Tyro SDK first.');
                return;
              }
              const ok = await confirm({
                title: 'Manual Settlement',
                description:
                  'This will close the batch on the Tyro terminal. The result will appear on the terminal screen.',
                confirmLabel: 'Settle Now',
                variant: 'warning',
              });
              if (!ok) return;
              try {
                tyroManualSettlement();
                toast.info('Settlement Started', 'See the terminal for the outcome.');
              } catch (err) {
                toast.error(
                  'Settlement Failed',
                  err instanceof Error ? err.message : 'Failed to start settlement',
                );
              }
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="cloud-upload-outline" size={16} color="#ccc" />
            <Text style={styles.secondaryBtnText}>Manual Settlement</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => {
              if (!isTyroInitialized()) {
                toast.warning('Not initialised', 'Initialise the Tyro SDK first.');
                return;
              }
              try {
                tyroReconciliationReport('txt', '');
                toast.info(
                  'Report Requested',
                  'See the terminal or iClient logs for the result.',
                );
              } catch (err) {
                toast.error(
                  'Report Failed',
                  err instanceof Error ? err.message : 'Failed to request report',
                );
              }
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="document-attach-outline" size={16} color="#ccc" />
            <Text style={styles.secondaryBtnText}>Reconciliation Report</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>
            Manual settlement closes the current batch. Reconciliation reports summarise
            activity between settlements.
          </Text>
        </View>

        {techMode && (
          <>
            {/* ─── Diagnostics ───────────────────────────── */}
            <Text style={styles.sectionTitle}>Diagnostics</Text>
            <View style={styles.card}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={openLogs} activeOpacity={0.85}>
                <Ionicons name="document-text-outline" size={16} color="#ccc" />
                <Text style={styles.secondaryBtnText}>Open iClient Logs</Text>
              </TouchableOpacity>
              <Text style={styles.hint}>
                Opens Tyro's hosted logs page in your browser. Use the expert view to see every
                request and callback from your most recent session.
              </Text>
            </View>
          </>
        )}

        {techMode && (
          <TouchableOpacity
            style={styles.dangerBtn}
            onPress={async () => {
              const ok = await confirm({
                title: 'Clear Tyro Settings',
                description:
                  'This will clear the API key, pairing info and preferences. You will need to re-enter them to take payments.',
                confirmLabel: 'Clear',
                destructive: true,
              });
              if (!ok) return;
              useTyroStore.getState().clearConfig();
              toast.success('Cleared', 'Tyro settings have been removed.');
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="trash-outline" size={16} color="#ef4444" />
            <Text style={styles.dangerBtnText}>Clear Tyro Settings</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* ─── Custom pairing modal ─────────────────────── */}
      <TyroPairingModal
        visible={showPairing}
        onClose={() => setShowPairing(false)}
        onComplete={(status) => {
          if (status === 'success') {
            // The actual integration key is stored securely by the SDK,
            // we just persist the fact that pairing succeeded.
            setConfig({ integrationKeyMask: 'Paired' });
          }
        }}
      />
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
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
  label: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  value: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    maxWidth: '60%',
    textAlign: 'right',
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    marginTop: 8,
  },
  hint: {
    color: '#555',
    fontSize: 11,
    marginTop: 10,
    lineHeight: 15,
  },
  divider: {
    height: 1,
    backgroundColor: '#1e1e2e',
    marginVertical: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  input: {
    backgroundColor: '#0f0f1a',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 8,
    color: '#fff',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryBtnText: {
    color: '#ccc',
    fontWeight: '600',
    fontSize: 13,
  },
  dangerBtn: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dangerBtnText: {
    color: '#ef4444',
    fontWeight: '700',
    fontSize: 13,
  },
  envOption: {
    paddingVertical: 10,
    borderRadius: 8,
  },
  envOptionActive: {
    backgroundColor: 'rgba(99,102,241,0.08)',
  },
  envLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  envLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  envHint: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 12,
  },
  toggleLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  toggleHint: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
});
