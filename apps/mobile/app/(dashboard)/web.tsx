import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useDashboardAuthStore } from '../../store/dashboard-auth';
import { toast } from '../../components/ui';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const DASHBOARD_URL = process.env['EXPO_PUBLIC_APP_URL'] ?? 'https://app.elevatedpos.com.au';

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

/**
 * v2.7.70 — C10. The dashboard WebView now signs in via the existing
 * /api/auth/device-sso bridge instead of injecting the merchant's
 * email + password into the embedded login form. The native side never
 * sees or stores the password — only the access token returned by
 * /api/v1/auth/login (which the dashboard-auth store handles).
 *
 * Bridge flow on entry:
 *   1. We have a valid token in the dashboard-auth store.
 *   2. Open the WebView at /api/auth/device-sso?token=<jwt>&redirect=<path>.
 *   3. The route handler validates the token upstream, sets the
 *      elevatedpos_token httpOnly cookie, and 302s to <path>.
 *   4. From there the WebView navigates as a logged-in user via cookie;
 *      no JavaScript injection of credentials anywhere.
 *
 * If we land back on /login (token expired or rejected), the operator
 * is sent back to the native app to sign in again. We still inject a
 * tiny bit of CSS to hide the POS / KDS / Kiosk device-management
 * sidebar entries — those are device-pairing pages that don't apply
 * inside the in-app WebView.
 */
export default function DashboardWebScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ path?: string }>();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const token = useDashboardAuthStore((s) => s.token);
  const hydrate = useDashboardAuthStore((s) => s.hydrate);
  const ready = useDashboardAuthStore((s) => s.ready);
  const clear = useDashboardAuthStore((s) => s.clear);

  useEffect(() => {
    if (!ready) hydrate();
  }, [ready, hydrate]);

  // Hide POS/KDS/Kiosk device-management entries from the sidebar.
  // These are app-device management pages that should not appear inside
  // the embedded WebView — operators should use the native launcher
  // instead. v2.7.70 — kept this CSS but DROPPED all
  // credential-injection JavaScript that previously read the password
  // out of SecureStore.
  const sidebarHideJS = `
    (function() {
      function applyHides() {
        try {
          var style = document.getElementById('__epos_hide_css__');
          if (!style) {
            style = document.createElement('style');
            style.id = '__epos_hide_css__';
            style.textContent =
              'a[href="/pos"], a[href="/kds"], a[href="/kiosk"],' +
              'a[href$="/pos/"], a[href$="/kds/"], a[href$="/kiosk/"],' +
              'a[href*="/dashboard/devices"]:not([href*="/dashboard/display"]),' +
              '[data-nav="pos"], [data-nav="kds"], [data-nav="kiosk"],' +
              '[data-sidebar-item="pos"], [data-sidebar-item="kds"], [data-sidebar-item="kiosk"],' +
              'a[href="/dashboard/pos"], a[href="/dashboard/kds"], a[href="/dashboard/kiosk"],' +
              'a[href$="/dashboard/pos/"], a[href$="/dashboard/kds/"], a[href$="/dashboard/kiosk/"]' +
              '{ display: none !important; }';
            (document.head || document.documentElement).appendChild(style);
          }
          var labels = ['POS Terminal', 'KDS Display', 'Kiosk', 'POS Devices', 'KDS Devices', 'Kiosk Devices'];
          document.querySelectorAll('a, li, button, [role="menuitem"]').forEach(function(el) {
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
      }, 500);
    })();
    true;
  `;

  // v2.7.70 — build the entry URL. Always go through device-sso when
  // we have a token; the bridge sets the cookie and redirects.
  const startUri = useMemo(() => {
    const requestedPath =
      params.path && typeof params.path === 'string' ? params.path : '/dashboard';
    // Defensive clamp — same rule the server-side bridge applies.
    const safePath =
      requestedPath.startsWith('/') &&
      !requestedPath.startsWith('//') &&
      !requestedPath.startsWith('/\\')
        ? requestedPath
        : '/dashboard';
    if (token) {
      const u = new URL(`${DASHBOARD_URL}/api/auth/device-sso`);
      u.searchParams.set('token', token);
      u.searchParams.set('redirect', safePath);
      return u.toString();
    }
    return `${DASHBOARD_URL}${safePath}`;
  }, [params.path, token]);

  // If we navigate back to /login mid-session (token expired, server
  // bounced us, etc.) bring the operator back to the native screen so
  // they can re-enter their password.
  function handleNavStateChange(nav: { url: string; canGoBack: boolean }) {
    setCanGoBack(nav.canGoBack);
    try {
      const u = new URL(nav.url);
      const hostMatches = u.host === new URL(DASHBOARD_URL).host;
      if (hostMatches && /\/login(\b|\/)/.test(u.pathname)) {
        // Token rejected or expired — wipe the stored token and
        // send the operator back to the native landing screen.
        clear().catch(() => { /* ignore */ });
        router.replace('/(dashboard)' as never);
      }
    } catch {
      // ignore non-parseable URLs
    }
  }

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
        injectedJavaScriptBeforeContentLoaded={sidebarHideJS}
        injectedJavaScript={sidebarHideJS}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => {
          setLoading(false);
          webRef.current?.injectJavaScript(sidebarHideJS);
        }}
        onNavigationStateChange={handleNavStateChange}
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
