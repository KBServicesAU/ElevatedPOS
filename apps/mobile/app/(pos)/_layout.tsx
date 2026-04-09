import { Slot, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface NavItem {
  /** File-system route (without (pos) group, since expo-router strips groups from pathname). */
  route: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const NAV_ITEMS: NavItem[] = [
  { route: '/',          label: 'Sell',      icon: 'cart' },
  { route: '/orders',    label: 'Orders',    icon: 'receipt' },
  { route: '/customers', label: 'Customers', icon: 'people' },
  { route: '/more',      label: 'More',      icon: 'menu' },
];

export default function PosLayout() {
  const router = useRouter();
  const pathname = usePathname();

  function isActive(route: string) {
    if (route === '/') {
      return pathname === '/' || pathname === '';
    }
    return pathname === route || pathname.startsWith(route + '/');
  }

  return (
    <SafeAreaView style={styles.root} edges={['left', 'top', 'bottom']}>
      <View style={styles.layout}>
        {/* ── Left vertical sidebar ── */}
        <View style={styles.sidebar}>
          <View style={styles.sidebarLogo}>
            <Ionicons name="rocket" size={22} color="#6366f1" />
          </View>
          <View style={styles.sidebarItems}>
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.route);
              return (
                <TouchableOpacity
                  key={item.route}
                  style={[styles.navItem, active && styles.navItemActive]}
                  onPress={() => router.push(item.route as never)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={item.icon}
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
          <Slot />
        </View>
      </View>
    </SafeAreaView>
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
});
