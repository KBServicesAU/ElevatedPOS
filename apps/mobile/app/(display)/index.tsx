'use no memo'; // React Native performance hint
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, Image, StyleSheet, Dimensions,
  ImageBackground, ScrollView, ActivityIndicator,
} from 'react-native';
import { useDeviceStore } from '../../store/device';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ── Types ──────────────────────────────────────────────────────────────────────

interface TextSection {
  id: string;
  type: 'text';
  content: string;
  style: { fontSize: number; color: string; fontWeight?: string; textAlign?: string };
}
interface MenuSection {
  id: string;
  type: 'menu';
  categoryId: string;
  categoryName?: string;
  style: { columns: 1 | 2 | 3; showPrices: boolean };
}
interface ImageSection {
  id: string;
  type: 'image';
  url: string;
  style: { height: number };
}
interface SpacerSection {
  id: string;
  type: 'spacer';
  height: number;
}
type Section = TextSection | MenuSection | ImageSection | SpacerSection;

interface DisplayContent {
  background: { type: 'color' | 'image'; value: string };
  logo?: { url: string; position: 'top-left' | 'top-right' | 'top-center' };
  sections: Section[];
  theme: 'dark' | 'light';
  pollIntervalSeconds: number;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DisplayScreen() {
  const { identity } = useDeviceStore();
  const [content, setContent] = useState<DisplayContent | null>(null);
  const [menuItems, setMenuItems] = useState<Record<string, MenuItem[]>>({});
  const [loading, setLoading] = useState(true);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const API_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'https://api.elevatedpos.com.au';

  const fetchMenuItems = useCallback(
    async (categoryId: string) => {
      if (!identity?.deviceToken) return;
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/products?categoryId=${categoryId}&limit=50&isActive=true`,
          { headers: { Authorization: `Bearer ${identity.deviceToken}` } },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { data: MenuItem[] };
        setMenuItems((prev) => ({ ...prev, [categoryId]: data.data ?? [] }));
      } catch {
        /* ignore network errors */
      }
    },
    [identity?.deviceToken, API_BASE],
  );

  const fetchContent = useCallback(async () => {
    if (!identity?.deviceToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/display/content`, {
        headers: { Authorization: `Bearer ${identity.deviceToken}` },
      });
      if (!res.ok) { setLoading(false); return; }
      const data = (await res.json()) as {
        data: { content: DisplayContent | null; pollIntervalSeconds: number };
      };
      const newContent = data.data.content;
      setContent(newContent);
      setLoading(false);

      // Fetch menu items for all menu sections that aren't cached yet
      if (newContent) {
        const menuSections = newContent.sections.filter(
          (s): s is MenuSection => s.type === 'menu',
        );
        for (const section of menuSections) {
          // Use functional updater to read current state without a dependency
          setMenuItems((prev) => {
            if (!prev[section.categoryId]) {
              fetchMenuItems(section.categoryId);
            }
            return prev;
          });
        }
      }

      // Reschedule poll based on server-provided interval
      const interval = (data.data.pollIntervalSeconds ?? 30) * 1000;
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = setInterval(fetchContent, interval);
    } catch {
      setLoading(false);
    }
  }, [identity?.deviceToken, API_BASE, fetchMenuItems]);

  useEffect(() => {
    fetchContent();
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [fetchContent]);

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  // ── Waiting for content ──────────────────────────────────────────────────────

  if (!content) {
    return (
      <View style={styles.waiting}>
        <Text style={styles.waitingIcon}>📺</Text>
        <Text style={styles.waitingTitle}>Display Ready</Text>
        <Text style={styles.waitingSubtitle}>
          Publish content from the ElevatedPOS dashboard to see it here.
        </Text>
      </View>
    );
  }

  // ── Render content ───────────────────────────────────────────────────────────

  const isDark = content.theme !== 'light';

  const logoAlign =
    content.logo?.position === 'top-right'
      ? 'flex-end'
      : content.logo?.position === 'top-center'
      ? 'center'
      : 'flex-start';

  const inner = (
    <View style={styles.inner}>
      {/* Logo */}
      {content.logo?.url ? (
        <View style={[styles.logoRow, { justifyContent: logoAlign }]}>
          <Image
            source={{ uri: content.logo.url }}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
      ) : null}

      {/* Sections */}
      {content.sections.map((section) => {
        if (section.type === 'spacer') {
          return <View key={section.id} style={{ height: section.height }} />;
        }

        if (section.type === 'text') {
          return (
            <Text
              key={section.id}
              style={[
                styles.textSection,
                {
                  fontSize: section.style.fontSize,
                  color: section.style.color,
                  fontWeight: (section.style.fontWeight as any) ?? 'normal',
                  textAlign: (section.style.textAlign as any) ?? 'left',
                },
              ]}
            >
              {section.content}
            </Text>
          );
        }

        if (section.type === 'image') {
          return (
            <Image
              key={section.id}
              source={{ uri: section.url }}
              style={{ width: '100%', height: section.style.height }}
              resizeMode="cover"
            />
          );
        }

        if (section.type === 'menu') {
          const items = menuItems[section.categoryId] ?? [];
          const cols = section.style.columns;
          return (
            <View key={section.id} style={styles.menuSection}>
              {section.categoryName ? (
                <Text
                  style={[styles.menuHeader, { color: isDark ? '#fff' : '#000' }]}
                >
                  {section.categoryName}
                </Text>
              ) : null}
              <View style={styles.menuGrid}>
                {items.map((item) => (
                  <View
                    key={item.id}
                    style={[styles.menuItem, { width: `${100 / cols}%` }]}
                  >
                    <Text
                      style={[
                        styles.menuItemName,
                        { color: isDark ? '#fff' : '#1a1a2e' },
                      ]}
                      numberOfLines={2}
                    >
                      {item.name}
                    </Text>
                    {section.style.showPrices ? (
                      <Text style={styles.menuItemPrice}>
                        ${item.price.toFixed(2)}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          );
        }

        return null;
      })}
    </View>
  );

  if (content.background.type === 'image') {
    return (
      <ImageBackground
        source={{ uri: content.background.value }}
        style={styles.container}
        resizeMode="cover"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>{inner}</ScrollView>
      </ImageBackground>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: content.background.value }]}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>{inner}</ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, width: SCREEN_W, height: SCREEN_H },
  loading: {
    flex: 1,
    backgroundColor: '#0d0d14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waiting: {
    flex: 1,
    backgroundColor: '#0d0d14',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  waitingIcon: { fontSize: 64, marginBottom: 24 },
  waitingTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
  },
  waitingSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    maxWidth: 400,
  },
  inner: { flex: 1, padding: 32 },
  logoRow: { width: '100%', marginBottom: 16 },
  logo: { width: 180, height: 80 },
  textSection: { marginBottom: 16 },
  menuSection: { marginBottom: 24 },
  menuHeader: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 16,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  menuItem: { padding: 8, marginBottom: 8 },
  menuItemName: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  menuItemPrice: { fontSize: 20, fontWeight: '800', color: '#6366f1' },
});
