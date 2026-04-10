import React, { useEffect, useRef, useState } from 'react';
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

function escapeJsString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function DashboardWebScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ path?: string }>();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const email = useDashboardAuthStore((s) => s.email);
  const password = useDashboardAuthStore((s) => s.password);
  const hydrate = useDashboardAuthStore((s) => s.hydrate);
  const ready = useDashboardAuthStore((s) => s.ready);

  useEffect(() => {
    if (!ready) hydrate();
  }, [ready, hydrate]);

  // Hide POS/KDS/Kiosk entries from the sidebar.
  const hideSidebarJS = `
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
  `;

  // Auto-login helper: when the login page is visible and we have saved
  // credentials, fill in and submit the form. We guard against running
  // more than once by setting a window-scoped flag.
  const autoLoginJS =
    email && password
      ? `
      function tryAutoLogin() {
        if (window.__epos_auto_login_done__) return;
        if (!/\\/login/.test(location.pathname)) return;
        var emailInput = document.querySelector('input[type="email"], input[name="email"], input#email');
        var pwdInput = document.querySelector('input[type="password"], input[name="password"], input#password');
        var form = emailInput && emailInput.form;
        if (emailInput && pwdInput && form) {
          var nativeEmailSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeEmailSetter.call(emailInput, '${escapeJsString(email)}');
          nativeEmailSetter.call(pwdInput, '${escapeJsString(password)}');
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
          setTimeout(function() {
            var submitBtn = form.querySelector('button[type="submit"]')
              || Array.prototype.find.call(form.querySelectorAll('button'), function(b) { return /sign in|log in|login/i.test(b.textContent || ''); });
            window.__epos_auto_login_done__ = true;
            if (submitBtn) submitBtn.click();
            else form.requestSubmit ? form.requestSubmit() : form.submit();
          }, 50);
        }
      }
      `
      : `function tryAutoLogin() { /* no creds */ }`;

  const injectedJS = `
    (function() {
      ${hideSidebarJS}
      ${autoLoginJS}
      applyHides();
      tryAutoLogin();
      var obs = new MutationObserver(function() { applyHides(); tryAutoLogin(); });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      var applied = 0;
      var iv = setInterval(function() {
        applyHides();
        tryAutoLogin();
        if (++applied >= 10) clearInterval(iv);
      }, 500);
    })();
    true;`;

  // Allow navigating to a specific web path passed via navigation
  // params (e.g. /(dashboard)/web?path=/dashboard/catalog).
  const startPath = params.path && typeof params.path === 'string' ? params.path : '/dashboard';
  const startUri = `${DASHBOARD_URL}${startPath.startsWith('/') ? '' : '/'}${startPath}`;

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
