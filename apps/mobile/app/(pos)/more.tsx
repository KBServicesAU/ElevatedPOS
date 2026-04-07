import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useDeviceStore } from '../../store/device';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const ROLE_LOCK = Constants.expoConfig?.extra?.roleLock ?? 'pos';
const DOWNLOADS_API =
  process.env['EXPO_PUBLIC_API_URL']
    ? `${process.env['EXPO_PUBLIC_API_URL'].replace(/\/+$/, '')}/api/downloads/latest`
    : 'https://elevatedpos.com.au/api/downloads/latest';

/* ------------------------------------------------------------------ */
/* Update checker                                                      */
/* ------------------------------------------------------------------ */

interface ReleaseInfo {
  version: string;
  buildNumber: number;
  downloadUrl: string;
  changelog: string[];
  releasedAt: string;
  size: string;
}

function compareVersions(current: string, remote: string): number {
  const a = current.split('.').map(Number);
  const b = remote.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((b[i] ?? 0) > (a[i] ?? 0)) return 1;
    if ((b[i] ?? 0) < (a[i] ?? 0)) return -1;
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function MoreScreen() {
  const router = useRouter();
  const { identity, clearIdentity } = useDeviceStore();

  // Update state
  const [checking, setChecking] = useState(false);
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const checkForUpdate = useCallback(async () => {
    setChecking(true);
    setCheckError(null);
    try {
      const res = await fetch(`${DOWNLOADS_API}?app=${ROLE_LOCK}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: ReleaseInfo = await res.json();
      setRelease(data);
      setUpdateAvailable(compareVersions(APP_VERSION, data.version) > 0);
      setLastChecked(new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : 'Check failed');
    } finally {
      setChecking(false);
    }
  }, []);

  // Auto-check on mount
  useEffect(() => {
    checkForUpdate();
  }, [checkForUpdate]);

  function handleDownloadUpdate() {
    if (!release?.downloadUrl) {
      Alert.alert('No Download URL', 'The update file is not available yet. Please try again later.');
      return;
    }
    Alert.alert(
      'Download Update',
      `Version ${release.version} will be downloaded. Install it once the download completes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: () => Linking.openURL(release.downloadUrl),
        },
      ],
    );
  }

  function handleUnpair() {
    Alert.alert(
      'Unpair Device',
      'This will remove all device credentials. You will need to pair again to use this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpair',
          style: 'destructive',
          onPress: async () => {
            await clearIdentity();
            router.replace('/pair');
          },
        },
      ],
    );
  }

  function truncate(str: string | null | undefined, len = 16): string {
    if (!str) return '—';
    return str.length > len ? `${str.slice(0, len)}...` : str;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Software Update ── */}
        <Text style={styles.sectionTitle}>Software Update</Text>

        <View style={styles.card}>
          {/* Current version */}
          <View style={styles.row}>
            <Text style={styles.label}>Installed Version</Text>
            <Text style={styles.value}>{APP_VERSION}</Text>
          </View>
          <View style={styles.divider} />

          {/* Latest version */}
          <View style={styles.row}>
            <Text style={styles.label}>Latest Version</Text>
            {checking ? (
              <ActivityIndicator size="small" color="#6366f1" />
            ) : (
              <Text style={[styles.value, updateAvailable && styles.updateHighlight]}>
                {release?.version ?? '—'}
              </Text>
            )}
          </View>

          {lastChecked && (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.label}>Last Checked</Text>
                <Text style={styles.valueSmall}>{lastChecked}</Text>
              </View>
            </>
          )}
        </View>

        {/* Update status */}
        {checkError ? (
          <View style={styles.statusBanner}>
            <Text style={styles.statusError}>Unable to check — {checkError}</Text>
          </View>
        ) : updateAvailable && release ? (
          <View style={styles.updateBanner}>
            <Text style={styles.updateTitle}>
              Version {release.version} available
            </Text>
            <Text style={styles.updateMeta}>
              {release.size} · Released{' '}
              {new Date(release.releasedAt).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
              })}
            </Text>
            {release.changelog.length > 0 && (
              <View style={styles.changelogBox}>
                {release.changelog.map((entry, i) => (
                  <Text key={i} style={styles.changelogItem}>
                    • {entry}
                  </Text>
                ))}
              </View>
            )}
            <TouchableOpacity
              style={styles.downloadBtn}
              onPress={handleDownloadUpdate}
              activeOpacity={0.85}
            >
              <Text style={styles.downloadBtnText}>Download & Install</Text>
            </TouchableOpacity>
          </View>
        ) : !checking ? (
          <View style={styles.statusBanner}>
            <Text style={styles.statusOk}>✓ You&apos;re on the latest version</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.checkBtn}
          onPress={checkForUpdate}
          disabled={checking}
          activeOpacity={0.85}
        >
          {checking ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.checkBtnText}>Check for Updates</Text>
          )}
        </TouchableOpacity>

        {/* ── Device Info ── */}
        <Text style={[styles.sectionTitle, { marginTop: 36 }]}>Device Info</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Role</Text>
            <View style={[styles.roleBadge, identity?.role === 'pos' ? styles.rolePOS : null]}>
              <Text style={styles.roleBadgeText}>{identity?.role?.toUpperCase() ?? '—'}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Label</Text>
            <Text style={styles.value}>{identity?.label ?? '—'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Location ID</Text>
            <Text style={styles.value}>{truncate(identity?.locationId)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Device ID</Text>
            <Text style={styles.value}>{truncate(identity?.deviceId)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Register ID</Text>
            <Text style={styles.value}>{truncate(identity?.registerId)}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.unpairBtn} onPress={handleUnpair} activeOpacity={0.85}>
          <Text style={styles.unpairBtnText}>Unpair Device</Text>
        </TouchableOpacity>

        <Text style={styles.warning}>
          Unpairing will require a new pairing code from the back-office.
        </Text>

        {/* Spacer for scroll */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  content: { flex: 1, padding: 24 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 16 },

  card: {
    backgroundColor: '#141425',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  divider: { height: 1, backgroundColor: '#1e1e2e', marginHorizontal: 16 },
  label: { fontSize: 14, color: '#777' },
  value: { fontSize: 14, color: '#ccc', fontWeight: '500' },
  valueSmall: { fontSize: 13, color: '#666', fontWeight: '400' },
  updateHighlight: { color: '#6366f1', fontWeight: '700' },

  // Update banner
  updateBanner: {
    backgroundColor: 'rgba(99,102,241,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.25)',
    padding: 16,
    marginBottom: 16,
  },
  updateTitle: { fontSize: 16, fontWeight: '700', color: '#6366f1', marginBottom: 4 },
  updateMeta: { fontSize: 13, color: '#888', marginBottom: 10 },
  changelogBox: {
    backgroundColor: 'rgba(99,102,241,0.06)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  changelogItem: { fontSize: 13, color: '#aaa', lineHeight: 20 },
  downloadBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  downloadBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Status banner
  statusBanner: {
    backgroundColor: '#141425',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  statusOk: { fontSize: 14, color: '#10b981', fontWeight: '600' },
  statusError: { fontSize: 13, color: '#ef4444', fontWeight: '500' },

  // Check button
  checkBtn: {
    backgroundColor: '#1e1e2e',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    marginBottom: 8,
  },
  checkBtnText: { fontSize: 15, fontWeight: '600', color: '#ccc' },

  // Role badge
  roleBadge: { backgroundColor: '#2a2a3a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  rolePOS: { backgroundColor: 'rgba(99,102,241,0.2)', borderWidth: 1, borderColor: '#6366f1' },
  roleBadgeText: { fontSize: 13, fontWeight: '800', color: '#6366f1' },

  // Unpair
  unpairBtn: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ef4444',
    marginBottom: 12,
    marginTop: 16,
  },
  unpairBtnText: { fontSize: 16, fontWeight: '700', color: '#ef4444' },
  warning: { fontSize: 13, color: '#555', textAlign: 'center', lineHeight: 18 },
});
