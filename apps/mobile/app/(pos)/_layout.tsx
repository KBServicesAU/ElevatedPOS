import React, { useState, useEffect, useRef } from 'react';
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
import { useReceiptPrefs } from '../../store/receipt-prefs';

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
  // v2.7.51 — industry gate for sidebar items. Hospitality merchants see
  // Floor Plan + Reservations + Online Orders; services merchants see
  // Bookings; retail merchants see Ecommerce. Older server builds (or
  // pre-onboarding devices) return undefined here and we hide the gated
  // items rather than guessing — better to under-show than to mis-show.
  const deviceIndustry = useDeviceSettings((s) => s.config?.identity?.industry);
  const hydrateAnz  = useAnzStore((s) => s.hydrate);
  const hydrateTill = useTillStore((s) => s.hydrate);
  const tillOpen    = useTillStore((s) => s.isOpen);
  const tillReady   = useTillStore((s) => s.ready);
  const hydrateReceiptPrefs = useReceiptPrefs((s) => s.hydrate);

  // Hydrate sidebar preferences on mount. Also hydrate the ANZ + till
  // stores here so the bridge provider can read terminal IP / till state
  // from the very first render. Receipt print prefs are hydrated here too
  // so the first sale after app launch respects the merchant's settings.
  React.useEffect(() => {
    hydrateSidebar();
    hydrateAnz();
    hydrateTill();
    hydrateReceiptPrefs();
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

  // Build nav items from enabled IDs in master order. The "close-till"
  // item is only relevant while a shift is active — hide it when the
  // till is closed so operators aren't presented with a no-op button
  // they have to think about.
  //
  // v2.7.51 — industry gate. Items with a `requiresIndustry` are only
  // shown when the merchant's industry matches. We bail out conservatively
  // when industry is unknown (older server / pre-onboarding) so a retail
  // merchant doesn't see Reservations even briefly during a fresh install.
  const navItems = ALL_SIDEBAR_ITEMS
    .filter(item => enabledIds.includes(item.id))
    .filter(item => item.id !== 'close-till' || tillOpen)
    // v2.7.93 — `requiresIndustry` can be a single value or array. An array
    // means "show for any of these industries" (e.g. Online Orders is
    // relevant to hospitality AND retail).
    .filter(item => {
      if (!item.requiresIndustry) return true;
      if (Array.isArray(item.requiresIndustry)) {
        return deviceIndustry !== undefined && (item.requiresIndustry as readonly string[]).includes(deviceIndustry);
      }
      return item.requiresIndustry === deviceIndustry;
    });

  // Auto-prompt: when an employee logs in and the till isn't open, route
  // them to Open Till ONCE so they enter the float before taking a sale.
  //
  // v2.7.20 — the previous version re-fired this redirect on every
  // navigation back to `/`, so if the operator closed the till without
  // logging out (common mid-shift) any tap on the Sell tab bounced them
  // back to Open Till — which felt like being kicked out. We now stash
  // the last employee id we prompted for in a ref and only fire the
  // redirect when the id transitions null → something (i.e., a fresh
  // login). Employees who dismissed the prompt stay on Sell and get a
  // banner from the Sell screen itself.
  const lastPromptedEmployeeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!employee) {
      lastPromptedEmployeeRef.current = null;
      return;
    }
    if (!tillReady) return;
    if (tillOpen) return;
    if (lastPromptedEmployeeRef.current === employee.id) return;
    lastPromptedEmployeeRef.current = employee.id;
    // v2.7.23 — the Sell screen now lives at `/sell`, but we still
    // treat a transient `/` (root) as "landing" because the root router
    // briefly resolves to `/` before redirecting to `/sell`. Firing the
    // auto-open-till redirect on either path keeps the UX identical.
    const isLanding = pathname === '/' || pathname === '' || pathname === '/sell';
    if (!isLanding) return;
    router.replace('/(pos)/open-till' as never);
  }, [employee, tillReady, tillOpen, pathname, router]);

  function isActive(route: string) {
    // v2.7.23 — the Sell URL is now `/sell`. Treat a transient `/` as
    // also active so the Sell nav item highlights during the brief
    // moment the root redirect is running (avoids a flicker where no
    // nav item is selected).
    if (route === '/sell') {
      return pathname === '/sell' || pathname === '/';
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
      onSelect: () => router.push('/sell' as never),
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
      id: 'close-till',
      label: 'Close Till',
      description: 'End the shift, reconcile cash, and sign out',
      icon: 'moon',
      iconColor: '#a855f7',
      section: 'Operations',
      keywords: ['close', 'eod', 'end of day', 'cash up', 'reconcile', 'shift'],
      onSelect: () => router.push('/(pos)/close-till' as never),
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
    // v2.7.30 — Tyro / ANZ terminal configuration removed from the POS
    // command palette. Payment terminals are now assigned per device
    // in the dashboard (Dashboard → Devices → Assign Terminal). Having
    // two places to configure caused device B to inherit device A's
    // terminal — see v2.7.26. Use the Sync button in More to re-pull.
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
