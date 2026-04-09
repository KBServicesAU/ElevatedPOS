import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const DASHBOARD_URL = process.env['EXPO_PUBLIC_APP_URL'] ?? 'https://app.elevatedpos.com.au';
const ADMIN_PIN = '0000'; // Default admin PIN — should be configurable

const EXTERNAL_APPS = [
  { key: 'pos', label: 'POS', icon: 'cart' as const, color: '#6366f1', packageName: 'com.au.elevatedpos.pos' },
  { key: 'kds', label: 'KDS', icon: 'restaurant' as const, color: '#f59e0b', packageName: 'com.au.elevatedpos.kds' },
  { key: 'kiosk', label: 'Kiosk', icon: 'tablet-portrait' as const, color: '#06b6d4', packageName: 'com.au.elevatedpos.kiosk' },
];

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function DashboardScreen() {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);

  // Hidden settings: 5-tap logo
  const [logoTaps, setLogoTaps] = useState(0);
  const [showPinModal, setShowPinModal] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleLogoTap() {
    const newCount = logoTaps + 1;
    setLogoTaps(newCount);
    // Reset counter after 3 seconds of inactivity
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => setLogoTaps(0), 3000);
    if (newCount >= 5) {
      setLogoTaps(0);
      setAdminPin('');
      setShowPinModal(true);
    }
  }

  function handlePinSubmit() {
    if (adminPin === ADMIN_PIN) {
      setShowPinModal(false);
      setShowSettings(true);
    } else {
      Alert.alert('Incorrect PIN', 'Please try again.');
      setAdminPin('');
    }
  }

  async function launchApp(app: (typeof EXTERNAL_APPS)[number]) {
    if (Platform.OS !== 'android') {
      Alert.alert('Not Supported', 'External app launch is only available on Android.');
      return;
    }
    // Android Intent URI: launches the LAUNCHER activity of the specified
    // package. This is the most reliable way to launch another installed
    // Android app from an Expo project without expo-intent-launcher.
    //
    // Note: canOpenURL() is unreliable for intent:// URIs on Android 11+
    // due to package visibility restrictions. We just try to openURL and
    // fall back to Play Store on failure.
    const intentUrl =
      `intent:#Intent;` +
      `action=android.intent.action.MAIN;` +
      `category=android.intent.category.LAUNCHER;` +
      `package=${app.packageName};` +
      `end`;
    try {
      await Linking.openURL(intentUrl);
    } catch {
      // Fallback: try Play Store then direct download
      Alert.alert(
        `${app.label} Not Installed`,
        `The ${app.label} app doesn't appear to be installed on this device.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Play Store',
            onPress: () =>
              Linking.openURL(`market://details?id=${app.packageName}`).catch(() =>
                Linking.openURL(`https://play.google.com/store/apps/details?id=${app.packageName}`),
              ),
          },
          {
            text: 'Direct Download',
            onPress: () => Linking.openURL('https://elevatedpos.com.au/downloads'),
          },
        ],
      );
    }
  }

  // Inject CSS to hide POS/KDS/Kiosk entries from the web sidebar, since
  // this is the dashboard-only tablet build and those routes are intended
  // to launch the external native apps instead.
  const injectedJS = `
    (function() {
      function applyHides() {
        try {
          // Exact-match selectors to avoid catching /dashboard/... routes.
          var style = document.getElementById('__epos_hide_css__');
          if (!style) {
            style = document.createElement('style');
            style.id = '__epos_hide_css__';
            style.textContent =
              'a[href="/pos"], a[href="/kds"], a[href="/kiosk"],' +
              'a[href$="/pos/"], a[href$="/kds/"], a[href$="/kiosk/"] ' +
              '{ display: none !important; }';
            (document.head || document.documentElement).appendChild(style);
          }
          // Text-matching fallback for buttons or wrappers without direct hrefs.
          var labels = ['POS Terminal', 'KDS Display', 'Kiosk'];
          document.querySelectorAll('a, li, button').forEach(function(el) {
            var txt = (el.textContent || '').trim();
            if (labels.indexOf(txt) !== -1) {
              el.style.display = 'none';
            }
          });
        } catch (e) { /* non-critical */ }
      }
      // Apply immediately and on DOM changes (nav may mount after first paint).
      applyHides();
      var obs = new MutationObserver(applyHides);
      obs.observe(document.documentElement, { childList: true, subtree: true });
      // Also re-apply periodically for the first 10 seconds to catch late renders.
      var applied = 0;
      var iv = setInterval(function() {
        applyHides();
        if (++applied >= 10) clearInterval(iv);
      }, 1000);
    })();
    true;`;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* ── Top Bar with Logo + App Drawer ── */}
      <View style={s.topBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {canGoBack && (
            <TouchableOpacity style={s.navBtn} onPress={() => webRef.current?.goBack()}>
              <Ionicons name="arrow-back" size={20} color="#ccc" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleLogoTap} activeOpacity={0.8}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>E</Text>
              </View>
              <Text style={s.topTitle}>ElevatedPOS</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* App Drawer */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {EXTERNAL_APPS.map((app) => (
            <TouchableOpacity
              key={app.key}
              style={{ alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: `${app.color}15` }}
              onPress={() => launchApp(app)}
              activeOpacity={0.7}
            >
              <Ionicons name={app.icon} size={16} color={app.color} />
              <Text style={{ fontSize: 9, color: app.color, fontWeight: '700', marginTop: 1 }}>{app.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.navBtn} onPress={() => webRef.current?.reload()}>
            <Ionicons name="refresh" size={16} color="#888" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── WebView — loads login page directly, no native login ── */}
      <WebView
        ref={webRef}
        source={{ uri: `${DASHBOARD_URL}/login` }}
        style={s.webview}
        injectedJavaScriptBeforeContentLoaded={injectedJS}
        injectedJavaScript={injectedJS}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => {
          setLoading(false);
          // Re-inject after load in case BeforeContentLoaded lost the handle
          webRef.current?.injectJavaScript(injectedJS);
        }}
        onNavigationStateChange={(nav) => setCanGoBack(nav.canGoBack)}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={s.loadingOverlay}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={s.loadingText}>Loading Dashboard...</Text>
          </View>
        )}
        onError={() => {
          Alert.alert('Connection Error', 'Could not load the dashboard.');
        }}
      />

      {/* ── Admin PIN Modal (5-tap hidden settings) ── */}
      <Modal visible={showPinModal} transparent animationType="fade" onRequestClose={() => setShowPinModal(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setShowPinModal(false)}>
          <Pressable style={s.modalContent} onPress={() => {}}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 4 }}>Admin Access</Text>
            <Text style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>Enter admin PIN to access settings</Text>
            <TextInput
              style={s.pinInput}
              value={adminPin}
              onChangeText={setAdminPin}
              placeholder="PIN"
              placeholderTextColor="#444"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              autoFocus
              onSubmitEditing={handlePinSubmit}
            />
            <TouchableOpacity style={s.pinBtn} onPress={handlePinSubmit}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Unlock</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Settings Modal ── */}
      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { width: 420, maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#fff' }}>Settings</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>

            {/* Device Info */}
            <View style={s.settCard}>
              <Text style={s.settLabel}>App</Text>
              <Text style={s.settValue}>ElevatedPOS Dashboard</Text>
            </View>
            <View style={s.settCard}>
              <Text style={s.settLabel}>Version</Text>
              <Text style={s.settValue}>1.0.0</Text>
            </View>
            <View style={s.settCard}>
              <Text style={s.settLabel}>Platform</Text>
              <Text style={s.settValue}>{Platform.OS} {Platform.Version}</Text>
            </View>

            {/* Actions */}
            <TouchableOpacity
              style={[s.settBtn, { backgroundColor: '#6366f1', marginTop: 16 }]}
              onPress={() => { setShowSettings(false); webRef.current?.reload(); }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Reload Dashboard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.settBtn, { backgroundColor: '#ef444420', borderWidth: 1, borderColor: '#ef4444', marginTop: 8 }]}
              onPress={() => {
                setShowSettings(false);
                webRef.current?.clearCache?.(true);
                webRef.current?.reload();
                Alert.alert('Cache Cleared', 'Dashboard cache has been cleared.');
              }}
            >
              <Text style={{ color: '#ef4444', fontWeight: '700' }}>Clear Cache & Reload</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {loading && (
        <View style={s.loadingBar}>
          <View style={s.loadingBarInner} />
        </View>
      )}
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#0d0d14', borderBottomWidth: 1, borderBottomColor: '#1e1e2e',
  },
  navBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  webview: { flex: 1 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0d0d14', alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#666', marginTop: 12, fontSize: 14 },
  loadingBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: '#1e1e2e' },
  loadingBarInner: { width: '60%', height: 2, backgroundColor: '#6366f1' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#1a1a2e', borderRadius: 20, padding: 24, width: 320, borderWidth: 1, borderColor: '#2a2a3a' },
  pinInput: { backgroundColor: '#0d0d14', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 24, color: '#fff', textAlign: 'center', letterSpacing: 8, borderWidth: 1, borderColor: '#2a2a3a', marginBottom: 12 },
  pinBtn: { backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  settCard: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e1e2e' },
  settLabel: { color: '#888', fontSize: 13 },
  settValue: { color: '#ccc', fontSize: 13, fontWeight: '600' },
  settBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
});
