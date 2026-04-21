import React, { useState, useEffect } from 'react';
import { Slot, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommandPalette, type CommandItem } from '../../components/ui';
import { useSidebarStore, ALL_SIDEBAR_ITEMS } from '../../store/sidebar';
import { useAuthStore } from '../../store/auth';
import { useDeviceSettings } from '../../store/device-settings';
import { AnzBridgeProvider } from '../../components/AnzBridgeHost';
import { useAnzStore } from '../../store/anz';
import { useTillStore } from '../../store/till';

interface NavItem {
  /** File-system route (without (pos) group, since expo-router strips groups from pathname). */
  route: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export default function PosLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const { enabledIds, hydrate: hydrateSidebar } = useSidebarStore();
  const employee = useAuthStore((s) => s.employee);
  const fetchDeviceSettings = useDeviceSettings((s) => s.fetch);
  const hydrateAnz  = useAnzStore((s) => s.hydrate);
  const hydrateTill = useTillStore((s) => s.hydrate);

  // Hydrate sidebar preferences on mount. Also hydrate the ANZ + till
  // stores here so the bridge provider can read terminal IP / till state
  // from the very first render.
  React.useEffect(() => {
    hydrateSidebar();
    hydrateAnz();
    hydrateTill();
  }, []);

  // Re-fetch device settings whenever the app comes to the foreground so
  // any changes made in the dashboard (e.g. switching payment provider from
  // ANZ Worldline → Tyro) take effect immediately without restarting the app.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        fetchDeviceSettings().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [fetchDeviceSettings]);

  // Build nav items from enabled IDs in master order
  const navItems = ALL_SIDEBAR_ITEMS.filter(item => enabledIds.includes(item.id));

  function isActive(route: string) {
    if (route === '/') {
      return pathname === '/' || pathname === '';
    }
    return pathname === route || pathname.startsWith(route + '/');
  }

  // Build command palette items lazily so router is in scope.
  const paletteItems: CommandItem[] = [
    {
      id: 'sell',
      label: 'Sell',
      description: 'Take a payment',
      icon: 'cart',
      iconColor: '#6366f1',
      section: 'Navigate',
      shortcut: '⌘1',
      onSelect: () => router.push('/' as never),
    },
    {
      id: 'orders',
      label: 'Orders',
      description: 'View order history',
      icon: 'receipt',
      iconColor: '#8b5cf6',
      section: 'Navigate',
      shortcut: '⌘2',
      onSelect: () => router.push('/orders' as never),
    },
    {
      id: 'customers',
      label: 'Customers',
      description: 'Find or add a customer',
      icon: 'people',
      iconColor: '#06b6d4',
      section: 'Navigate',
      shortcut: '⌘3',
      onSelect: () => router.push('/customers' as never),
    },
    {
      id: 'quick-sale',
      label: 'Quick Sale',
      description: 'Sell a one-off item',
      icon: 'flash',
      iconColor: '#f59e0b',
      section: 'Operations',
      keywords: ['quick', 'sale', 'misc', 'one off'],
      onSelect: () => router.push('/(pos)/quick-sale' as never),
    },
    {
      id: 'gift-cards',
      label: 'Gift Cards',
      description: 'Issue or check a gift card',
      icon: 'gift',
      iconColor: '#ec4899',
      section: 'Operations',
      keywords: ['gift', 'voucher', 'card'],
      onSelect: () => router.push('/(pos)/gift-cards' as never),
    },
    {
      id: 'laybys',
      label: 'Laybys',
      description: 'Manage layby plans',
      icon: 'wallet',
      iconColor: '#06b6d4',
      section: 'Operations',
      keywords: ['layby', 'layaway', 'instalment'],
      onSelect: () => router.push('/(pos)/laybys' as never),
    },
    {
      id: 'eod',
      label: 'End of Day',
      description: 'Close the till and run EOD',
      icon: 'moon',
      iconColor: '#a855f7',
      section: 'Operations',
      keywords: ['close', 'eod', 'cash up', 'reconcile'],
      onSelect: () => router.push('/(pos)/eod' as never),
    },
    {
      id: 'floor-plan',
      label: 'Floor Plan',
      description: 'Manage tables and seating',
      icon: 'grid',
      iconColor: '#6366f1',
      section: 'Operations',
      keywords: ['floor', 'tables', 'seats', 'plan', 'dining', 'restaurant'],
      onSelect: () => router.push('/(pos)/floor-plan' as never),
    },
    {
      id: 'split-check',
      label: 'Split Check',
      description: 'Divide the bill by seat',
      icon: 'people-circle',
      iconColor: '#22c55e',
      section: 'Operations',
      keywords: ['split', 'seat', 'bill', 'separate', 'check', 'divide'],
      onSelect: () => router.push('/(pos)/split-check' as never),
    },
    {
      id: 'wet-dry-setup',
      label: 'Wet / Dry Setup',
      description: 'Tag categories for wet/dry reports',
      icon: 'beer',
      iconColor: '#06b6d4',
      section: 'Settings',
      keywords: ['wet', 'dry', 'food', 'drinks', 'beverage', 'category', 'split'],
      onSelect: () => router.push('/(pos)/wet-dry-setup' as never),
    },
    {
      id: 'upsell-setup',
      label: 'Kiosk Upsell',
      description: 'Pick suggested items for kiosk checkout',
      icon: 'sparkles',
      iconColor: '#f59e0b',
      section: 'Settings',
      keywords: ['upsell', 'suggest', 'kiosk', 'cross sell', 'recommend', 'add on'],
      onSelect: () => router.push('/(pos)/upsell-setup' as never),
    },
    {
      id: 'tyro',
      label: 'Tyro EFTPOS',
      description: 'Configure card terminal',
      icon: 'card',
      iconColor: '#22c55e',
      section: 'Settings',
      onSelect: () => router.push('/(pos)/tyro-settings' as never),
    },
    {
      id: 'more',
      label: 'More & Settings',
      description: 'Printers, devices, sign out',
      icon: 'menu',
      iconColor: '#94a3b8',
      section: 'Settings',
      onSelect: () => router.push('/more' as never),
    },
  ];

  return (
    <AnzBridgeProvider>
    <SafeAreaView style={styles.root} edges={['left', 'top', 'bottom']}>
      <View style={styles.layout}>
        {/* ── Left vertical sidebar ── */}
        <View style={styles.sidebar}>
          <TouchableOpacity
            style={styles.sidebarLogo}
            onPress={() => setPaletteOpen(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="search" size={20} color="#6366f1" />
          </TouchableOpacity>
          <View style={styles.sidebarItems}>
            {navItems.map((item) => {
              const active = isActive(item.route);
              return (
                <TouchableOpacity
                  key={item.route}
                  style={[styles.navItem, active && styles.navItemActive]}
                  onPress={() => router.push(item.route as never)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={item.icon as keyof typeof Ionicons.glyphMap}
                    size={22}
                    color={active ? '#fff' : '#666'}
                  />
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Page content ── */}
        <View style={styles.content}>
          {/* Staff header — employee name + Switch button (P4) */}
          {employee && (
            <View style={styles.staffHeader}>
              <Text style={styles.staffName} numberOfLines={1}>
                {employee.firstName} {employee.lastName}
              </Text>
              <TouchableOpacity
                style={styles.switchBtn}
                onPress={() => router.push('/employee-login' as never)}
                activeOpacity={0.7}
              >
                <Ionicons name="swap-horizontal-outline" size={13} color="#94a3b8" />
                <Text style={styles.switchBtnText}>Switch</Text>
              </TouchableOpacity>
            </View>
          )}
          <Slot />
        </View>
      </View>

      {/* ── Global command palette ── */}
      <CommandPalette
        visible={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={paletteItems}
        placeholder="Jump to a screen, action, or setting…"
      />
    </SafeAreaView>
    </AnzBridgeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d14' },
  layout: { flex: 1, flexDirection: 'row' },

  sidebar: {
    width: 76,
    backgroundColor: '#0d0d14',
    borderRightWidth: 1,
    borderRightColor: '#1e1e2e',
    alignItems: 'center',
    paddingVertical: 12,
  },
  sidebarLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#141425',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  sidebarItems: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 6,
    gap: 6,
  },
  navItem: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  navItemActive: {
    backgroundColor: '#6366f1',
  },
  navLabel: {
    fontSize: 10,
    color: '#666',
    fontWeight: '700',
    marginTop: 2,
  },
  navLabelActive: { color: '#fff' },

  content: { flex: 1 },

  // Staff header bar (P4) — sits above <Slot /> in the content column
  staffHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 36,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
    gap: 10,
  },
  staffName: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
    maxWidth: 180,
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#141425',
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  switchBtnText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '700',
  },
});
