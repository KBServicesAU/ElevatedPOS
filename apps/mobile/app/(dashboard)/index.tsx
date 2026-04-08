import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { useAuthStore } from '../../store/auth';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const DASHBOARD_URL = process.env['EXPO_PUBLIC_APP_URL'] ?? 'https://app.elevatedpos.com.au';

const EXTERNAL_APPS = [
  {
    key: 'pos',
    label: 'POS',
    icon: 'cart' as const,
    color: '#6366f1',
    packageName: 'com.au.elevatedpos.pos',
  },
  {
    key: 'kds',
    label: 'KDS',
    icon: 'restaurant' as const,
    color: '#f59e0b',
    packageName: 'com.au.elevatedpos.kds',
  },
  {
    key: 'kiosk',
    label: 'Kiosk',
    icon: 'tablet-portrait' as const,
    color: '#06b6d4',
    packageName: 'com.au.elevatedpos.kiosk',
  },
];

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function DashboardScreen() {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const token = useAuthStore.getState().employeeToken;

  // Inject the auth token as a cookie so the WebView is logged in
  // Also hide the POS/KDS/Kiosk links in the sidebar since we have them in the app bar
  const injectedJS = token
    ? `
       document.cookie = "elevatedpos_token=${token}; path=/; max-age=28800; SameSite=Lax";
       window.__ELEVATED_TOKEN__ = "${token}";
       // Hide POS Terminal, KDS Display, Kiosk links from sidebar
       (function hideNavItems() {
         var style = document.createElement('style');
         style.textContent = 'a[href*="/pos"], a[href*="/kds"], a[href*="/kiosk"] { display: none !important; }';
         document.head.appendChild(style);
         // Retry after hydration
         setTimeout(function() {
           var links = document.querySelectorAll('a');
           links.forEach(function(a) {
             var text = a.textContent || '';
             if (text.match(/POS Terminal|KDS Display|Kiosk/)) a.style.display = 'none';
           });
         }, 2000);
       })();
       true;`
    : 'true;';

  async function launchApp(app: (typeof EXTERNAL_APPS)[number]) {
    if (Platform.OS !== 'android') {
      Alert.alert('Not Available', 'External app launch is only supported on Android.');
      return;
    }
    try {
      // Android: use the package manager launch intent directly
      const launchUrl = `${app.packageName}://`;
      const canOpen = await Linking.canOpenURL(launchUrl);
      if (canOpen) {
        await Linking.openURL(launchUrl);
        return;
      }
      // Fallback: try intent scheme
      const intentUrl = `intent://main#Intent;scheme=elevatedpos;package=${app.packageName};end`;
      await Linking.openURL(intentUrl);
    } catch {
      Alert.alert(
        `${app.label} Not Installed`,
        `The ${app.label} app is not installed on this device.\n\nDownload it from elevatedpos.com.au/downloads`,
        [
          { text: 'OK' },
          {
            text: 'Download',
            onPress: () => Linking.openURL('https://elevatedpos.com.au/downloads'),
          },
        ],
      );
    }
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* ── Top Bar ── */}
      <View style={s.topBar}>
        {canGoBack ? (
          <TouchableOpacity style={s.navBtn} onPress={() => webRef.current?.goBack()}>
            <Ionicons name="arrow-back" size={20} color="#ccc" />
          </TouchableOpacity>
        ) : (
          <View style={s.navBtn} />
        )}

        <Text style={s.topTitle}>ElevatedPOS</Text>

        <TouchableOpacity style={s.navBtn} onPress={() => webRef.current?.reload()}>
          <Ionicons name="refresh" size={18} color="#888" />
        </TouchableOpacity>
      </View>

      {/* ── App Launcher Bar ── */}
      <View style={s.appBar}>
        {EXTERNAL_APPS.map((app) => (
          <TouchableOpacity
            key={app.key}
            style={s.appBtn}
            onPress={() => launchApp(app)}
            activeOpacity={0.7}
          >
            <View style={[s.appIcon, { backgroundColor: `${app.color}20` }]}>
              <Ionicons name={app.icon} size={18} color={app.color} />
            </View>
            <Text style={[s.appLabel, { color: app.color }]}>{app.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── WebView ── */}
      <WebView
        ref={webRef}
        source={{ uri: `${DASHBOARD_URL}/dashboard` }}
        style={s.webview}
        injectedJavaScriptBeforeContentLoaded={injectedJS}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(nav) => setCanGoBack(nav.canGoBack)}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={s.loadingOverlay}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={s.loadingText}>Loading Dashboard...</Text>
          </View>
        )}
        onError={() => {
          Alert.alert('Connection Error', 'Could not load the dashboard. Check your internet connection.');
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
    paddingVertical: 8,
    backgroundColor: '#0d0d14',
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },

  appBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 10,
    backgroundColor: '#0d0d14',
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  appBtn: { alignItems: 'center', gap: 4 },
  appIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appLabel: { fontSize: 11, fontWeight: '700' },

  webview: { flex: 1 },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0d0d14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { color: '#666', marginTop: 12, fontSize: 14 },

  loadingBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#1e1e2e',
  },
  loadingBarInner: {
    width: '60%',
    height: 2,
    backgroundColor: '#6366f1',
  },
});
