import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const DASHBOARD_URL = process.env['EXPO_PUBLIC_APP_URL'] ?? 'https://app.elevatedpos.com.au';

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function DashboardWebScreen() {
  const router = useRouter();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);

  // Inject CSS to hide POS/KDS/Kiosk entries from the web sidebar, since
  // this is the dashboard-only tablet build and those routes are intended
  // to launch the external native apps instead.
  const injectedJS = `
    (function() {
      function applyHides() {
        try {
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
          var labels = ['POS Terminal', 'KDS Display', 'Kiosk'];
          document.querySelectorAll('a, li, button').forEach(function(el) {
            var txt = (el.textContent || '').trim();
            if (labels.indexOf(txt) !== -1) {
              el.style.display = 'none';
            }
          });
        } catch (e) { /* non-critical */ }
      }
      applyHides();
      var obs = new MutationObserver(applyHides);
      obs.observe(document.documentElement, { childList: true, subtree: true });
      var applied = 0;
      var iv = setInterval(function() {
        applyHides();
        if (++applied >= 10) clearInterval(iv);
      }, 1000);
    })();
    true;`;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* ── Top Bar ── */}
      <View style={s.topBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            style={s.navBtn}
            onPress={() => router.replace('/(dashboard)')}
            activeOpacity={0.7}
          >
            <Ionicons name="home" size={20} color="#ccc" />
          </TouchableOpacity>
          {canGoBack && (
            <TouchableOpacity style={s.navBtn} onPress={() => webRef.current?.goBack()}>
              <Ionicons name="arrow-back" size={20} color="#ccc" />
            </TouchableOpacity>
          )}
          <Text style={s.topTitle}>Web Dashboard</Text>
        </View>
        <TouchableOpacity style={s.navBtn} onPress={() => webRef.current?.reload()}>
          <Ionicons name="refresh" size={18} color="#888" />
        </TouchableOpacity>
      </View>

      {/* ── WebView ── */}
      <WebView
        ref={webRef}
        source={{ uri: `${DASHBOARD_URL}/login` }}
        style={s.webview}
        injectedJavaScriptBeforeContentLoaded={injectedJS}
        injectedJavaScript={injectedJS}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => {
          setLoading(false);
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#0d0d14',
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  webview: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0d0d14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { color: '#666', marginTop: 12, fontSize: 14 },
  loadingBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: '#1e1e2e' },
  loadingBarInner: { width: '60%', height: 2, backgroundColor: '#6366f1' },
});
