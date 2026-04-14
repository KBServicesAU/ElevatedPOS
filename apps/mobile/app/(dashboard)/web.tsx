import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { toast } from '../../components/ui';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const DASHBOARD_URL = process.env['EXPO_PUBLIC_APP_URL'] ?? 'https://app.elevatedpos.com.au';

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function DashboardWebScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ path?: string; token?: string }>();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);

  // The path the user wants to land on after authentication
  const startPath = params.path && typeof params.path === 'string' ? params.path : '/dashboard';
  // Fresh access token passed from the native login/refresh flow
  const token = params.token && typeof params.token === 'string' ? params.token : null;

  // If we have a token, load through the SSO endpoint which:
  //   1. Validates the token against the auth service
  //   2. Sets the elevatedpos_token session cookie
  //   3. Redirects to startPath — fully authenticated, no login screen
  // If no token (edge case), load the path directly — the web app's
  // middleware will redirect to /login if the session has expired.
  const startUri = token
    ? `${DASHBOARD_URL}/api/auth/device-sso?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(startPath)}`
    : `${DASHBOARD_URL}${startPath.startsWith('/') ? '' : '/'}${startPath}`;

  // Hide POS/KDS/Kiosk device-management entries from the sidebar.
  // These are app-device management pages that should not appear inside
  // the embedded WebView — operators should use the native launcher instead.
  const hideSidebarJS = `
    (function() {
      function applyHides() {
        try {
          var style = document.getElementById('__epos_hide_css__');
          if (!style) {
            style = document.createElement('style');
            style.id = '__epos_hide_css__';
            style.textContent =
              /* href-based — covers exact paths and sub-paths */
              'a[href="/pos"], a[href="/kds"], a[href="/kiosk"],' +
              'a[href$="/pos/"], a[href$="/kds/"], a[href$="/kiosk/"],' +
              /* devices section (e.g. /dashboard/devices/...) but not display */
              'a[href*="/dashboard/devices"]:not([href*="/dashboard/display"]),' +
              /* data-nav attributes used by some nav frameworks */
              '[data-nav="pos"], [data-nav="kds"], [data-nav="kiosk"],' +
              /* common sidebar role/item selectors */
              '[data-sidebar-item="pos"], [data-sidebar-item="kds"], [data-sidebar-item="kiosk"],' +
              /* nav links that explicitly target the app management pages */
              'a[href="/dashboard/pos"], a[href="/dashboard/kds"], a[href="/dashboard/kiosk"],' +
              'a[href$="/dashboard/pos/"], a[href$="/dashboard/kds/"], a[href$="/dashboard/kiosk/"]' +
              '{ display: none !important; }';
            (document.head || document.documentElement).appendChild(style);
          }
          /* Also hide by visible label text as a belt-and-braces fallback */
          var labels = ['POS Terminal', 'KDS Display', 'Kiosk', 'POS Devices', 'KDS Devices', 'Kiosk Devices'];
          document.querySelectorAll('a, li, button, [role="menuitem"]').forEach(function(el) {
            var txt = (el.textContent || '').trim();
            if (labels.indexOf(txt) !== -1) el.style.display = 'none';
          });
        } catch (e) { /* non-critical */ }
      }
      applyHides();
      var obs = new MutationObserver(applyHides);
      obs.observe(document.documentElement, { childList: true, subtree: true });
      var i = 0;
      var iv = setInterval(function() { applyHides(); if (++i >= 10) clearInterval(iv); }, 500);
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
        source={{ uri: startUri }}
        style={s.webview}
        injectedJavaScriptBeforeContentLoaded={hideSidebarJS}
        injectedJavaScript={hideSidebarJS}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => {
          setLoading(false);
          webRef.current?.injectJavaScript(hideSidebarJS);
        }}
        onNavigationStateChange={(nav) => setCanGoBack(nav.canGoBack)}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={s.loadingOverlay}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={s.loadingText}>Loading Dashboard...</Text>
          </View>
        )}
        onError={() => {
          toast.error('Connection Error', 'Could not load the dashboard.');
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
