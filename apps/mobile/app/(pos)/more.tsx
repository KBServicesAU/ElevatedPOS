import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { confirm, toast } from '../../components/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useDeviceStore } from '../../store/device';
import { useAuthStore } from '../../store/auth';
import { useEmployeeStore, type Shift } from '../../store/employee';
import { useDeviceSettings } from '../../store/device-settings';
import { usePrinterStore, type PrinterConnectionType } from '../../store/printers';
import { useSidebarStore, ALL_SIDEBAR_ITEMS } from '../../store/sidebar';
import { useCustomerDisplayStore } from '../../store/customer-display';
import { useCatalogStore, type CatalogProduct } from '../../store/catalog';
import { useTillStore } from '../../store/till';
import { useReceiptPrefs, type EftposAttach } from '../../store/receipt-prefs';
import { catalogApiFetch } from '../../lib/catalog-api';
import {
  connectPrinter,
  disconnectPrinter,
  discoverPrinters,
  printTestPage,
  printOrderPrinterTestPage,
  isConnected as isPrinterConnected,
  type DiscoveredPrinter,
} from '../../lib/printer';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const ROLE_LOCK = Constants.expoConfig?.extra?.roleLock ?? 'pos';
const DOWNLOADS_API =
  process.env['EXPO_PUBLIC_STOREFRONT_URL']
    ? `${process.env['EXPO_PUBLIC_STOREFRONT_URL'].replace(/\/+$/, '')}/api/downloads/latest`
    : 'https://elevatedpos.com.au/api/downloads/latest';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

interface ReleaseInfo {
  version: string;
  buildNumber: number;
  downloadUrl: string;
  changelog: string[];
  releasedAt: string;
  size: string;
}

function compareVersions(current: string, remote: string): number {
  const a = current.split('.').map(Number);
  const b = remote.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((b[i] ?? 0) > (a[i] ?? 0)) return 1;
    if ((b[i] ?? 0) < (a[i] ?? 0)) return -1;
  }
  return 0;
}

function formatShiftDuration(clockInAt: string): string {
  const mins = Math.floor((Date.now() - new Date(clockInAt).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

function truncate(str: string | null | undefined, len = 16): string {
  if (!str) return '—';
  return str.length > len ? `${str.slice(0, len)}...` : str;
}

function segLabel(opt: EftposAttach): string {
  if (opt === 'off') return 'Off';
  if (opt === 'attached') return 'Attached';
  return 'Standalone';
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function MoreScreen() {
  const router = useRouter();
  const { identity, clearIdentity } = useDeviceStore();
  const { employee: authEmployee, logout: authLogout } = useAuthStore();
  const serverConfig = useDeviceSettings((s) => s.config);

  // ── Clock ────────────────────────────────────────────────────────
  const {
    currentShift,
    loading: clockLoading,
    error: clockError,
    checkCurrentShift,
    clockIn,
    clockOut,
    startBreak,
    endBreak,
    clearError: clearClockError,
  } = useEmployeeStore();
  const [shiftDuration, setShiftDuration] = useState('');

  // ── Printer ──────────────────────────────────────────────────────
  const { config: printerConfig, hydrate: hydratePrinter, setConfig: setPrinterConfig } =
    usePrinterStore();
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [editPrinter, setEditPrinter] = useState({
    type: null as PrinterConnectionType | null,
    address: '',
    name: '',
    paperWidth: 80 as 58 | 80,
    autoPrint: false,
  });

  // ── Customer Display ──────────────────────────────────────────────
  const {
    settings: displaySettings,
    hydrate: hydrateDisplay,
    setSettings: setDisplaySettings,
  } = useCustomerDisplayStore();

  const { enabledIds: sidebarEnabledIds, hydrate: hydrateSidebar, toggle: toggleSidebarItem, reset: resetSidebar } = useSidebarStore();
  const [showSidebarModal, setShowSidebarModal] = useState(false);

  // ── Quick Manage ─────────────────────────────────────────────────
  const [showManageModal, setShowManageModal] = useState(false);
  const { products, categories, fetchAll: fetchCatalog } = useCatalogStore();
  const [managingProducts, setManagingProducts] = useState(true); // true=products, false=categories
  const [toggling, setToggling] = useState<string | null>(null);

  // ── Add/Edit forms ──────────────────────────────────────────────
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [prodForm, setProdForm] = useState({ name: '', sku: '', basePrice: '', categoryId: '', description: '' });
  const [catForm, setCatForm] = useState({ name: '', color: '#6366f1', printerDestination: 'none', kdsDestination: 'none', sortOrder: '0' });

  // ── Update ───────────────────────────────────────────────────────
  const [checking, setChecking] = useState(false);
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  // ── Till ─────────────────────────────────────────────────────────
  const tillOpen = useTillStore((s) => s.isOpen);
  const tillOpenedAt = useTillStore((s) => s.openedAt);
  const hydrateTill = useTillStore((s) => s.hydrate);

  // ── Receipt print prefs ──────────────────────────────────────────
  const printStoreReceipt    = useReceiptPrefs((s) => s.printStoreReceipt);
  const printCustomerReceipt = useReceiptPrefs((s) => s.printCustomerReceipt);
  const eftposStoreAttach    = useReceiptPrefs((s) => s.eftposStoreAttach);
  const eftposCustomerAttach = useReceiptPrefs((s) => s.eftposCustomerAttach);
  const hydrateReceiptPrefs  = useReceiptPrefs((s) => s.hydrate);
  const setReceiptPref       = useReceiptPrefs((s) => s.setPrint);

  /* ── Effects ──────────────────────────────────────────────────── */

  // Hydrate stores on mount
  useEffect(() => {
    checkCurrentShift();
    hydratePrinter();
    hydrateDisplay();
    checkForUpdate();
    hydrateSidebar();
    hydrateTill();
    hydrateReceiptPrefs();
  }, []);

  // Shift timer
  useEffect(() => {
    if (!currentShift) {
      setShiftDuration('');
      return;
    }
    setShiftDuration(formatShiftDuration(currentShift.clockInAt));
    const interval = setInterval(() => {
      setShiftDuration(formatShiftDuration(currentShift.clockInAt));
    }, 60_000);
    return () => clearInterval(interval);
  }, [currentShift]);

  /* ── Update checker ───────────────────────────────────────────── */

  const checkForUpdate = useCallback(async () => {
    setChecking(true);
    setCheckError(null);
    try {
      const res = await fetch(`${DOWNLOADS_API}?app=${ROLE_LOCK}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: ReleaseInfo = await res.json();
      setRelease(data);
      setUpdateAvailable(compareVersions(APP_VERSION, data.version) > 0);
      setLastChecked(
        new Date().toLocaleTimeString('en-AU', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : 'Check failed');
    } finally {
      setChecking(false);
    }
  }, []);

  async function handleDownloadUpdate() {
    if (!release?.downloadUrl) {
      toast.warning('No Download URL', 'The update file is not available yet.');
      return;
    }
    const ok = await confirm({
      title: 'Download Update',
      description: `Version ${release.version} will be downloaded. Install it once complete.`,
      confirmLabel: 'Download',
    });
    if (ok) Linking.openURL(release.downloadUrl);
  }

  /* ── Clock handlers ───────────────────────────────────────────── */

  async function handleClockIn() {
    try {
      await clockIn();
      toast.success('Clocked In', 'Your shift has started.');
    } catch (err) {
      toast.error('Clock In Failed', err instanceof Error ? err.message : 'Unknown error');
    }
  }

  async function handleClockOut() {
    const ok = await confirm({
      title: 'Clock Out',
      description: 'Are you sure you want to end your shift?',
      confirmLabel: 'Clock Out',
      destructive: true,
    });
    if (!ok) return;
    try {
      await clockOut();
      toast.success('Clocked Out', 'Your shift has ended.');
    } catch (err) {
      toast.error(
        'Clock Out Failed',
        err instanceof Error ? err.message : 'Unknown error',
      );
    }
  }

  async function handleBreakToggle() {
    try {
      // Simple toggle — a more robust version would track break state
      await startBreak();
      toast.success('Break Started', 'Enjoy your break!');
    } catch (err) {
      // If break already started, try ending it
      try {
        await endBreak();
        toast.success('Break Ended', 'Welcome back!');
      } catch {
        toast.error('Error', err instanceof Error ? err.message : 'Break toggle failed');
      }
    }
  }

  /* ── Product availability toggle ──────────────────────────────── */

  async function toggleProductAvailability(product: CatalogProduct) {
    setToggling(product.id);
    try {
      await catalogApiFetch(`/api/v1/products/${product.id}/availability`, {
        method: 'POST',
        body: JSON.stringify({ available: !product.isActive }),
      });
      // Refresh catalog
      await fetchCatalog();
    } catch (err) {
      toast.error('Error', err instanceof Error ? err.message : 'Failed to update product');
    } finally {
      setToggling(null);
    }
  }

  /* ── Add / Edit Product ───────────────────────────────────────── */

  function openAddProduct() {
    setProdForm({ name: '', sku: '', basePrice: '', categoryId: '', description: '' });
    setEditingProduct(null);
    setShowAddProduct(true);
  }

  function openEditProduct(p: CatalogProduct) {
    setProdForm({
      name: p.name,
      sku: p.sku ?? '',
      basePrice: parseFloat(p.basePrice || '0').toFixed(2),
      categoryId: p.categoryId ?? '',
      description: '',
    });
    setEditingProduct(p);
    setShowAddProduct(true);
  }

  async function saveProduct() {
    if (!prodForm.name || !prodForm.basePrice) {
      toast.warning('Missing Fields', 'Name and price are required.');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, any> = {
        name: prodForm.name,
        basePrice: Math.round(parseFloat(prodForm.basePrice) * 100), // dollars → cents
      };
      if (prodForm.sku) body.sku = prodForm.sku;
      if (prodForm.categoryId) body.categoryId = prodForm.categoryId;
      if (prodForm.description) body.description = prodForm.description;

      if (editingProduct) {
        await catalogApiFetch(`/api/v1/products/${editingProduct.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        if (!body.sku) body.sku = `SKU-${Date.now()}`;
        await catalogApiFetch('/api/v1/products', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      await fetchCatalog();
      setShowAddProduct(false);
      toast.success(editingProduct ? 'Product updated' : 'Product added');
    } catch (err) {
      toast.error('Error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  /* ── Add / Edit Category ─────────────────────────────────────── */

  function openAddCategory() {
    setCatForm({ name: '', color: '#6366f1', printerDestination: 'none', kdsDestination: 'none', sortOrder: '0' });
    setEditingCategory(null);
    setShowAddCategory(true);
  }

  function openEditCategory(c: any) {
    setCatForm({
      name: c.name,
      color: c.color ?? '#6366f1',
      printerDestination: c.printerDestination ?? 'none',
      kdsDestination: c.kdsDestination ?? 'none',
      sortOrder: String(c.sortOrder ?? 0),
    });
    setEditingCategory(c);
    setShowAddCategory(true);
  }

  async function saveCategory() {
    if (!catForm.name) {
      toast.warning('Missing Fields', 'Name is required.');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, any> = {
        name: catForm.name,
        color: catForm.color,
        sortOrder: parseInt(catForm.sortOrder) || 0,
      };
      if (catForm.printerDestination !== 'none') body.printerDestination = catForm.printerDestination;
      if (catForm.kdsDestination !== 'none') body.kdsDestination = catForm.kdsDestination;

      if (editingCategory) {
        await catalogApiFetch(`/api/v1/categories/${editingCategory.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await catalogApiFetch('/api/v1/categories', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      await fetchCatalog();
      setShowAddCategory(false);
      toast.success(editingCategory ? 'Category updated' : 'Category added');
    } catch (err) {
      toast.error('Error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const DEST_OPTIONS = ['none', 'front', 'back', 'bar', 'kitchen', 'custom'] as const;
  const COLOR_OPTIONS = ['#6366f1', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6'] as const;

  /* ── Printer handlers ─────────────────────────────────────────── */

  function openPrinterModal() {
    setEditPrinter({
      type: printerConfig.type,
      address: printerConfig.address,
      name: printerConfig.name,
      paperWidth: printerConfig.paperWidth,
      autoPrint: printerConfig.autoPrint,
    });
    setShowPrinterModal(true);
  }

  async function savePrinterConfig() {
    await setPrinterConfig(editPrinter);
    setShowPrinterModal(false);
  }

  const [discovering, setDiscovering] = useState(false);
  const [discoveredPrinters, setDiscoveredPrinters] = useState<DiscoveredPrinter[]>([]);
  const [printerConnected, setPrinterConnected] = useState(false);

  async function handleTestPrint() {
    if (!printerConfig.type) {
      toast.warning('No Printer', 'Please configure a printer first.');
      return;
    }
    try {
      await printTestPage();
      setPrinterConnected(true);
      toast.success('Test print sent', 'Check the printer.');
    } catch (err) {
      toast.error('Print Failed', err instanceof Error ? err.message : 'Could not print');
    }
  }

  async function handleDiscoverPrinters(type: PrinterConnectionType) {
    setDiscovering(true);
    try {
      const devices = await discoverPrinters(type);
      setDiscoveredPrinters(devices);
      if (devices.length === 0) {
        toast.warning('No Printers Found', `No ${type.toUpperCase()} printers detected. Check the connection.`);
      }
    } catch (err) {
      toast.error('Discovery Failed', err instanceof Error ? err.message : 'Could not scan for printers');
    } finally {
      setDiscovering(false);
    }
  }

  async function handleSelectPrinter(printer: DiscoveredPrinter) {
    try {
      await setPrinterConfig({
        type: printer.type,
        address: printer.id,
        name: printer.name,
      });
      setDiscoveredPrinters([]);
      toast.success('Printer Saved', `${printer.name} configured. Tap "Connect" to establish connection.`);
    } catch (err) {
      toast.error('Error', err instanceof Error ? err.message : 'Could not save printer');
    }
  }

  async function handleConnectPrinter() {
    const { type } = usePrinterStore.getState().config;
    const ok = await confirm({
      title: 'Connect Printer',
      description:
        type === 'usb'
          ? 'Make sure your USB printer is plugged in. The system will request USB permission.'
          : type === 'bluetooth'
            ? 'Make sure the printer is powered on and paired with this device.'
            : 'Ensure the printer is reachable on the network.',
      confirmLabel: 'Connect',
    });
    if (!ok) return;
    try {
      await connectPrinter();
      setPrinterConnected(true);
      toast.success('Connected', 'Printer connected successfully.');
    } catch (err) {
      setPrinterConnected(false);
      toast.error('Connection Failed', err instanceof Error ? err.message : 'Could not connect to printer.');
    }
  }

  /* ── Order printer (separate kitchen / bar printer) ─────────── */
  const [discoveringOrder, setDiscoveringOrder] = useState(false);
  const [discoveredOrderPrinters, setDiscoveredOrderPrinters] = useState<DiscoveredPrinter[]>([]);

  async function handleDiscoverOrderPrinters(type: PrinterConnectionType) {
    setDiscoveringOrder(true);
    try {
      const devices = await discoverPrinters(type);
      setDiscoveredOrderPrinters(devices);
      if (devices.length === 0) {
        toast.warning(
          'No Printers Found',
          `No ${type.toUpperCase()} printers detected. Check the connection.`,
        );
      }
    } catch (err) {
      toast.error(
        'Discovery Failed',
        err instanceof Error ? err.message : 'Could not scan for printers',
      );
    } finally {
      setDiscoveringOrder(false);
    }
  }

  async function handleSelectOrderPrinter(printer: DiscoveredPrinter) {
    try {
      await setPrinterConfig({
        orderPrinter: {
          type: printer.type,
          address: printer.id,
          name: printer.name,
          paperWidth: printerConfig.orderPrinter?.paperWidth ?? 80,
        },
      });
      setDiscoveredOrderPrinters([]);
      toast.success(
        'Order Printer Saved',
        `${printer.name} will receive kitchen / bar tickets.`,
      );
    } catch (err) {
      toast.error(
        'Error',
        err instanceof Error ? err.message : 'Could not save order printer',
      );
    }
  }

  async function handleTestOrderPrinter() {
    if (!printerConfig.orderPrinter?.type) {
      toast.warning('No Order Printer', 'Please configure an order printer first.');
      return;
    }
    try {
      await printOrderPrinterTestPage();
      toast.success('Test page sent', 'Sent to order printer.');
    } catch (err) {
      toast.error(
        'Print Failed',
        err instanceof Error ? err.message : 'Could not print',
      );
    }
  }

  /* ── Unpair ───────────────────────────────────────────────────── */

  async function handleUnpair() {
    const ok = await confirm({
      title: 'Unpair Device',
      description: 'This will remove all device credentials. You will need to pair again.',
      confirmLabel: 'Unpair',
      destructive: true,
    });
    if (!ok) return;
    await clearIdentity();
    router.replace('/pair');
  }

  /* ── Open manage modal ────────────────────────────────────────── */

  function openManageModal(tab: 'products' | 'categories') {
    setManagingProducts(tab === 'products');
    fetchCatalog();
    setShowManageModal(true);
  }

  /* ── Render ───────────────────────────────────────────────────── */

  return (
    <SafeAreaView style={s.container}>
      <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
        {/* ═══════ Logged-in Employee ═══════ */}
        {authEmployee && (
          <View style={[s.card, { marginBottom: 16 }]}>
            <View style={s.row}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={s.empAvatar}>
                  <Text style={s.empAvatarText}>
                    {authEmployee.firstName.charAt(0)}{authEmployee.lastName.charAt(0)}
                  </Text>
                </View>
                <View>
                  <Text style={[s.value, { fontWeight: '700' }]}>
                    {authEmployee.firstName} {authEmployee.lastName}
                  </Text>
                  <Text style={s.valueSmall}>{authEmployee.email}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={s.switchBtn}
                onPress={async () => {
                  const ok = await confirm({
                    title: 'Switch Employee',
                    description: 'Lock the POS and return to the login screen?',
                    confirmLabel: 'Switch',
                  });
                  if (ok) {
                    authLogout();
                    router.replace('/employee-login');
                  }
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="swap-horizontal" size={18} color="#6366f1" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ═══════ Clock In/Out ═══════ */}
        <Text style={s.sectionTitle}>Time Clock</Text>

        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.label}>Status</Text>
            <View
              style={[
                s.statusBadge,
                currentShift ? s.statusBadgeActive : s.statusBadgeInactive,
              ]}
            >
              <View
                style={[
                  s.statusDot,
                  { backgroundColor: currentShift ? '#22c55e' : '#ef4444' },
                ]}
              />
              <Text
                style={[
                  s.statusBadgeText,
                  { color: currentShift ? '#22c55e' : '#ef4444' },
                ]}
              >
                {currentShift ? 'Clocked In' : 'Clocked Out'}
              </Text>
            </View>
          </View>
          {currentShift && (
            <>
              <View style={s.divider} />
              <View style={s.row}>
                <Text style={s.label}>Shift Duration</Text>
                <Text style={s.value}>{shiftDuration || '—'}</Text>
              </View>
              <View style={s.divider} />
              <View style={s.row}>
                <Text style={s.label}>Started</Text>
                <Text style={s.valueSmall}>
                  {new Date(currentShift.clockInAt).toLocaleTimeString('en-AU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            </>
          )}
        </View>

        <View style={s.btnRow}>
          {currentShift ? (
            <>
              <TouchableOpacity
                style={s.breakBtn}
                onPress={handleBreakToggle}
                disabled={clockLoading}
                activeOpacity={0.85}
              >
                <Ionicons name="cafe-outline" size={18} color="#f59e0b" />
                <Text style={s.breakBtnText}>Break</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.clockOutBtn}
                onPress={handleClockOut}
                disabled={clockLoading}
                activeOpacity={0.85}
              >
                {clockLoading ? (
                  <ActivityIndicator size="small" color="#ef4444" />
                ) : (
                  <>
                    <Ionicons name="log-out-outline" size={18} color="#ef4444" />
                    <Text style={s.clockOutBtnText}>Clock Out</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={s.clockInBtn}
              onPress={handleClockIn}
              disabled={clockLoading}
              activeOpacity={0.85}
            >
              {clockLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="log-in-outline" size={18} color="#fff" />
                  <Text style={s.clockInBtnText}>Clock In</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {clockError && (
          <TouchableOpacity onPress={clearClockError}>
            <Text style={s.errorNote}>{clockError}</Text>
          </TouchableOpacity>
        )}

        {/* ═══════ Quick Manage ═══════ */}
        <Text style={[s.sectionTitle, { marginTop: 32 }]}>Quick Manage</Text>

        <View style={s.card}>
          <TouchableOpacity
            style={s.menuRow}
            onPress={async () => {
              try {
                await fetchCatalog();
                toast.success('Menu Refreshed', `${useCatalogStore.getState().products.length} products · ${useCatalogStore.getState().categories.length} categories`);
              } catch (err) {
                toast.error('Refresh Failed', err instanceof Error ? err.message : 'Could not refresh menu');
              }
            }}
          >
            <View style={s.menuRowLeft}>
              <Ionicons name="refresh-outline" size={20} color="#22c55e" />
              <Text style={s.menuRowText}>Refresh Menu</Text>
            </View>
            <View style={s.menuRowRight}>
              <Ionicons name="chevron-forward" size={18} color="#444" />
            </View>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity style={s.menuRow} onPress={() => openManageModal('products')}>
            <View style={s.menuRowLeft}>
              <Ionicons name="cube-outline" size={20} color="#6366f1" />
              <Text style={s.menuRowText}>Products</Text>
            </View>
            <View style={s.menuRowRight}>
              <Text style={s.menuRowCount}>{products.length}</Text>
              <Ionicons name="chevron-forward" size={18} color="#444" />
            </View>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity style={s.menuRow} onPress={() => openManageModal('categories')}>
            <View style={s.menuRowLeft}>
              <Ionicons name="grid-outline" size={20} color="#ec4899" />
              <Text style={s.menuRowText}>Categories</Text>
            </View>
            <View style={s.menuRowRight}>
              <Text style={s.menuRowCount}>{categories.length}</Text>
              <Ionicons name="chevron-forward" size={18} color="#444" />
            </View>
          </TouchableOpacity>
        </View>

        {/* ═══════ Operations ═══════ */}
        <Text style={[s.sectionTitle, { marginTop: 32 }]}>Operations</Text>

        <View style={s.card}>
          <TouchableOpacity
            style={s.menuRow}
            onPress={() => router.push('/(pos)/quick-sale' as never)}
            activeOpacity={0.7}
          >
            <View style={s.menuRowLeft}>
              <Ionicons name="flash-outline" size={20} color="#f59e0b" />
              <Text style={s.menuRowText}>Quick Sale</Text>
            </View>
            <View style={s.menuRowRight}>
              <Text style={s.menuRowSub}>Custom amount</Text>
              <Ionicons name="chevron-forward" size={18} color="#444" />
            </View>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity
            style={s.menuRow}
            onPress={() => router.push('/(pos)/gift-cards' as never)}
            activeOpacity={0.7}
          >
            <View style={s.menuRowLeft}>
              <Ionicons name="gift-outline" size={20} color="#a78bfa" />
              <Text style={s.menuRowText}>Gift Cards</Text>
            </View>
            <View style={s.menuRowRight}>
              <Text style={s.menuRowSub}>Issue · Check · Void</Text>
              <Ionicons name="chevron-forward" size={18} color="#444" />
            </View>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity
            style={s.menuRow}
            onPress={() => router.push('/(pos)/laybys' as never)}
            activeOpacity={0.7}
          >
            <View style={s.menuRowLeft}>
              <Ionicons name="bookmark-outline" size={20} color="#06b6d4" />
              <Text style={s.menuRowText}>Laybys</Text>
            </View>
            <View style={s.menuRowRight}>
              <Text style={s.menuRowSub}>Layaway plans</Text>
              <Ionicons name="chevron-forward" size={18} color="#444" />
            </View>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity
            style={s.menuRow}
            onPress={() => router.push('/(pos)/floor-plan' as never)}
            activeOpacity={0.7}
          >
            <View style={s.menuRowLeft}>
              <Ionicons name="grid-outline" size={20} color="#6366f1" />
              <Text style={s.menuRowText}>Floor Plan</Text>
            </View>
            <View style={s.menuRowRight}>
              <Text style={s.menuRowSub}>Tables · Zones · Layout</Text>
              <Ionicons name="chevron-forward" size={18} color="#444" />
            </View>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity
            style={s.menuRow}
            onPress={() => router.push('/(pos)/split-check' as never)}
            activeOpacity={0.7}
          >
            <View style={s.menuRowLeft}>
              <Ionicons name="people-circle-outline" size={20} color="#22c55e" />
              <Text style={s.menuRowText}>Split Check</Text>
            </View>
            <View style={s.menuRowRight}>
              <Text style={s.menuRowSub}>Divide bill by seat</Text>
              <Ionicons name="chevron-forward" size={18} color="#444" />
            </View>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity
            style={s.menuRow}
            onPress={() => router.push('/(pos)/wet-dry-setup' as never)}
            activeOpacity={0.7}
          >
            <View style={s.menuRowLeft}>
              <Ionicons name="beer-outline" size={20} color="#06b6d4" />
              <Text style={s.menuRowText}>Wet / Dry Setup</Text>
            </View>
            <View style={s.menuRowRight}>
              <Text style={s.menuRowSub}>Tag categories for reports</Text>
              <Ionicons name="chevron-forward" size={18} color="#444" />
            </View>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity
            style={s.menuRow}
            onPress={() => router.push('/(pos)/upsell-setup' as never)}
            activeOpacity={0.7}
          >
            <View style={s.menuRowLeft}>
              <Ionicons name="sparkles-outline" size={20} color="#f59e0b" />
              <Text style={s.menuRowText}>Kiosk Upsell</Text>
            </View>
            <View style={s.menuRowRight}>
              <Text style={s.menuRowSub}>Suggested items at checkout</Text>
              <Ionicons name="chevron-forward" size={18} color="#444" />
            </View>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity
            style={s.menuRow}
            onPress={() => router.push('/(pos)/close-till' as never)}
            activeOpacity={0.7}
          >
            <View style={s.menuRowLeft}>
              <Ionicons name="document-text-outline" size={20} color="#22c55e" />
              <Text style={s.menuRowText}>Close Till</Text>
            </View>
            <View style={s.menuRowRight}>
              <Text style={s.menuRowSub}>End shift &amp; reconcile</Text>
              <Ionicons name="chevron-forward" size={18} color="#444" />
            </View>
          </TouchableOpacity>
        </View>

        {/* ═══════ Payments ═══════ */}
        <Text style={[s.sectionTitle, { marginTop: 32 }]}>Payments</Text>

        <View style={s.card}>
          <TouchableOpacity
            style={s.menuRow}
            onPress={() => router.push('/(pos)/anz-settings' as never)}
            activeOpacity={0.7}
          >
            <View style={s.menuRowLeft}>
              <Ionicons name="settings-outline" size={20} color="#6366f1" />
              <Text style={s.menuRowText}>ANZ Settings</Text>
            </View>
            <View style={s.menuRowRight}>
              <Text style={s.menuRowSub}>Terminal IP · TIM API</Text>
              <Ionicons name="chevron-forward" size={18} color="#444" />
            </View>
          </TouchableOpacity>
          <View style={s.divider} />
          {tillOpen ? (
            <TouchableOpacity
              style={s.menuRow}
              onPress={() => router.push('/(pos)/close-till' as never)}
              activeOpacity={0.7}
            >
              <View style={s.menuRowLeft}>
                <Ionicons name="lock-closed-outline" size={20} color="#ef4444" />
                <Text style={s.menuRowText}>Close Till</Text>
              </View>
              <View style={s.menuRowRight}>
                <Text style={s.menuRowSub}>
                  {tillOpenedAt
                    ? `Opened at ${new Date(tillOpenedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Till is open'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color="#444" />
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={s.menuRow}
              onPress={() => router.push('/(pos)/open-till' as never)}
              activeOpacity={0.7}
            >
              <View style={s.menuRowLeft}>
                <Ionicons name="lock-open-outline" size={20} color="#22c55e" />
                <Text style={s.menuRowText}>Open Till</Text>
              </View>
              <View style={s.menuRowRight}>
                <Text style={s.menuRowSub}>Start shift · connect terminal</Text>
                <Ionicons name="chevron-forward" size={18} color="#444" />
              </View>
            </TouchableOpacity>
          )}
          <View style={s.divider} />
          <TouchableOpacity
            style={s.menuRow}
            onPress={() => router.push('/(pos)/tyro-settings' as never)}
            activeOpacity={0.7}
          >
            <View style={s.menuRowLeft}>
              <Ionicons name="terminal-outline" size={20} color="#22c55e" />
              <Text style={s.menuRowText}>Tyro</Text>
            </View>
            <View style={s.menuRowRight}>
              <Text style={s.menuRowSub}>Configure Tyro terminal</Text>
              <Ionicons name="chevron-forward" size={18} color="#444" />
            </View>
          </TouchableOpacity>
        </View>

        {/* ═══════ Receipts ═══════ */}
        <Text style={[s.sectionTitle, { marginTop: 32 }]}>Receipts</Text>
        <Text style={[s.valueSmall, { paddingHorizontal: 4, marginTop: -10, marginBottom: 8 }]}>
          Choose what prints on every sale. Attached = ANZ receipt at the bottom of the POS receipt; standalone = separate cut receipt.
        </Text>

        <View style={s.card}>
          {/* Print store (merchant) POS receipt */}
          <View style={s.row}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.label}>Print store receipt</Text>
              <Text style={[s.valueSmall, { marginTop: 2 }]}>
                Merchant copy of the POS receipt
              </Text>
            </View>
            <Switch
              value={printStoreReceipt}
              onValueChange={(v) => setReceiptPref({ printStoreReceipt: v })}
              trackColor={{ false: '#2a2a3a', true: '#6366f180' }}
              thumbColor={printStoreReceipt ? '#6366f1' : '#555'}
            />
          </View>
          <View style={s.divider} />

          {/* Print EFTPOS store receipt (3-way) */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={s.label}>Print EFTPOS store receipt</Text>
            <Text style={[s.valueSmall, { marginTop: 2, marginBottom: 10 }]}>
              ANZ terminal merchant copy
            </Text>
            <View style={s.segRow}>
              {(['off', 'attached', 'standalone'] as EftposAttach[]).map((opt) => {
                const selected = eftposStoreAttach === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[s.segBtn, selected && s.segBtnActive]}
                    onPress={() => setReceiptPref({ eftposStoreAttach: opt })}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.segBtnText, selected && s.segBtnTextActive]}>
                      {segLabel(opt)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View style={s.divider} />

          {/* Print customer POS receipt */}
          <View style={s.row}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.label}>Print customer receipt</Text>
              <Text style={[s.valueSmall, { marginTop: 2 }]}>
                Customer copy of the POS receipt
              </Text>
            </View>
            <Switch
              value={printCustomerReceipt}
              onValueChange={(v) => setReceiptPref({ printCustomerReceipt: v })}
              trackColor={{ false: '#2a2a3a', true: '#6366f180' }}
              thumbColor={printCustomerReceipt ? '#6366f1' : '#555'}
            />
          </View>
          <View style={s.divider} />

          {/* Print EFTPOS customer receipt (3-way) */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={s.label}>Print EFTPOS customer receipt</Text>
            <Text style={[s.valueSmall, { marginTop: 2, marginBottom: 10 }]}>
              ANZ terminal customer copy
            </Text>
            <View style={s.segRow}>
              {(['off', 'attached', 'standalone'] as EftposAttach[]).map((opt) => {
                const selected = eftposCustomerAttach === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[s.segBtn, selected && s.segBtnActive]}
                    onPress={() => setReceiptPref({ eftposCustomerAttach: opt })}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.segBtnText, selected && s.segBtnTextActive]}>
                      {segLabel(opt)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* ═══════ Printer Settings ═══════ */}
        <Text style={[s.sectionTitle, { marginTop: 32 }]}>Printer</Text>

        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.label}>Receipt Printer</Text>
            <Text style={s.value}>
              {printerConfig.name || (printerConfig.type ? printerConfig.address : 'Not configured')}
            </Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Connection</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: printerConnected ? '#22c55e' : '#666' }} />
              <Text style={s.value}>
                {printerConfig.type?.toUpperCase() ?? '—'} {printerConnected ? '(Connected)' : ''}
              </Text>
            </View>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Auto-Print Receipts</Text>
            <Switch
              value={printerConfig.autoPrint}
              onValueChange={v => setPrinterConfig({ autoPrint: v })}
              trackColor={{ false: '#2a2a3a', true: '#6366f180' }}
              thumbColor={printerConfig.autoPrint ? '#6366f1' : '#555'}
            />
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Print Order Ticket</Text>
              <Text style={[s.valueSmall, { marginTop: 2 }]}>
                Kitchen ticket (items + qty only)
              </Text>
            </View>
            <Switch
              value={printerConfig.printOrderTicket}
              onValueChange={v => setPrinterConfig({ printOrderTicket: v })}
              trackColor={{ false: '#2a2a3a', true: '#f59e0b80' }}
              thumbColor={printerConfig.printOrderTicket ? '#f59e0b' : '#555'}
            />
          </View>
        </View>

        {/* Scan + Connect + Test buttons */}
        <View style={s.btnRow}>
          <TouchableOpacity
            style={s.outlineBtn}
            onPress={() => handleDiscoverPrinters('usb')}
            activeOpacity={0.85}
          >
            {discovering ? <ActivityIndicator size="small" color="#ccc" /> : <Ionicons name="search-outline" size={16} color="#ccc" />}
            <Text style={s.outlineBtnText}>Scan USB</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.outlineBtn, printerConnected && { borderColor: '#22c55e' }, !printerConfig.type && { opacity: 0.4 }]}
            onPress={printerConnected ? handleTestPrint : handleConnectPrinter}
            disabled={!printerConfig.type}
            activeOpacity={0.85}
          >
            <Ionicons name={printerConnected ? 'print-outline' : 'link-outline'} size={16} color={printerConnected ? '#22c55e' : '#ccc'} />
            <Text style={[s.outlineBtnText, printerConnected && { color: '#22c55e' }]}>
              {printerConnected ? 'Test Print' : 'Connect'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Discovered printers list */}
        {discoveredPrinters.length > 0 && (
          <View style={[s.card, { marginTop: 8 }]}>
            <Text style={[s.label, { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }]}>Found Printers</Text>
            {discoveredPrinters.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[s.manageRow, { paddingHorizontal: 16 }]}
                onPress={() => handleSelectPrinter(p)}
                activeOpacity={0.6}
              >
                <Ionicons name="print" size={18} color="#6366f1" style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.manageName}>{p.name}</Text>
                  <Text style={s.manageSub}>{p.type.toUpperCase()} · {p.id}</Text>
                </View>
                <Ionicons name="add-circle-outline" size={22} color="#22c55e" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={[s.btnRow, { marginTop: 8 }]}>
          <TouchableOpacity style={s.outlineBtn} onPress={openPrinterModal} activeOpacity={0.85}>
            <Ionicons name="settings-outline" size={16} color="#ccc" />
            <Text style={s.outlineBtnText}>Advanced</Text>
          </TouchableOpacity>
        </View>

        {/* ═══════ Order Printer ═══════ */}
        <Text style={[s.sectionTitle, { marginTop: 24 }]}>Order Printer</Text>
        <Text style={[s.valueSmall, { paddingHorizontal: 4, marginTop: -6, marginBottom: 8 }]}>
          Optional second printer for kitchen / bar tickets
        </Text>

        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.label}>Order Printer</Text>
            <Text style={s.value}>
              {printerConfig.orderPrinter?.name ||
                (printerConfig.orderPrinter?.type
                  ? printerConfig.orderPrinter.address
                  : 'Not configured')}
            </Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Connection</Text>
            <Text style={s.value}>
              {printerConfig.orderPrinter?.type?.toUpperCase() ?? '—'}
            </Text>
          </View>
        </View>

        <View style={s.btnRow}>
          <TouchableOpacity
            style={s.outlineBtn}
            onPress={() => handleDiscoverOrderPrinters('usb')}
            activeOpacity={0.85}
          >
            {discoveringOrder ? (
              <ActivityIndicator size="small" color="#ccc" />
            ) : (
              <Ionicons name="search-outline" size={16} color="#ccc" />
            )}
            <Text style={s.outlineBtnText}>Scan USB</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.outlineBtn, !printerConfig.orderPrinter?.address && { opacity: 0.4 }]}
            onPress={handleTestOrderPrinter}
            disabled={!printerConfig.orderPrinter?.address}
            activeOpacity={0.85}
          >
            <Ionicons name="print-outline" size={16} color="#ccc" />
            <Text style={s.outlineBtnText}>Test</Text>
          </TouchableOpacity>
        </View>

        {discoveredOrderPrinters.length > 0 && (
          <View style={[s.card, { marginTop: 8 }]}>
            <Text style={[s.label, { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }]}>
              Found Printers
            </Text>
            {discoveredOrderPrinters.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[s.manageRow, { paddingHorizontal: 16 }]}
                onPress={() => handleSelectOrderPrinter(p)}
                activeOpacity={0.6}
              >
                <Ionicons name="print" size={18} color="#f59e0b" style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.manageName}>{p.name}</Text>
                  <Text style={s.manageSub}>{p.type.toUpperCase()} · {p.id}</Text>
                </View>
                <Ionicons name="add-circle-outline" size={22} color="#f59e0b" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {printerConfig.orderPrinter?.type && (
          <View style={[s.btnRow, { marginTop: 8 }]}>
            <TouchableOpacity
              style={[s.outlineBtn, { borderColor: '#ef444444' }]}
              onPress={() =>
                setPrinterConfig({
                  orderPrinter: { type: null, address: '', name: '', paperWidth: 80 },
                })
              }
              activeOpacity={0.85}
            >
              <Ionicons name="close-circle-outline" size={16} color="#ef4444" />
              <Text style={[s.outlineBtnText, { color: '#ef4444' }]}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ═══════ Sidebar ═══════ */}
        <Text style={[s.sectionTitle, { marginTop: 32 }]}>Sidebar</Text>

        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.label}>Navigation items</Text>
            <Text style={s.value}>{sidebarEnabledIds.length} visible</Text>
          </View>
          <View style={s.divider} />
          <TouchableOpacity style={s.menuRow} onPress={() => setShowSidebarModal(true)} activeOpacity={0.7}>
            <View style={s.menuRowLeft}>
              <Ionicons name="list-outline" size={20} color="#6366f1" />
              <Text style={s.menuRowText}>Customise Sidebar</Text>
            </View>
            <View style={s.menuRowRight}>
              <Text style={s.menuRowSub}>Add shortcuts &amp; reorder</Text>
              <Ionicons name="chevron-forward" size={18} color="#444" />
            </View>
          </TouchableOpacity>
        </View>

        {/* ═══════ Customer Display ═══════ */}
        <Text style={[s.sectionTitle, { marginTop: 32 }]}>Customer Display</Text>

        <View style={s.card}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Customer-Facing Screen</Text>
              <Text style={[s.valueSmall, { marginTop: 2 }]}>
                iMin Swan dual-screen / HDMI
              </Text>
            </View>
            <Switch
              value={displaySettings.enabled}
              onValueChange={(v) => setDisplaySettings({ enabled: v })}
              trackColor={{ false: '#2a2a3a', true: '#6366f180' }}
              thumbColor={displaySettings.enabled ? '#6366f1' : '#555'}
            />
          </View>
          {displaySettings.enabled && (
            <>
              <View style={s.divider} />
              <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
                <Text style={{ color: '#555', fontSize: 12, lineHeight: 18 }}>
                  Display content (messages, logo, line items) is configured in the Dashboard → Devices page.
                </Text>
              </View>
            </>
          )}
        </View>

        {/* ═══════ Software Update ═══════ */}
        <Text style={[s.sectionTitle, { marginTop: 32 }]}>Software Update</Text>

        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.label}>Installed Version</Text>
            <Text style={s.value}>{APP_VERSION}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Latest Version</Text>
            {checking ? (
              <ActivityIndicator size="small" color="#6366f1" />
            ) : (
              <Text style={[s.value, updateAvailable && s.updateHighlight]}>
                {release?.version ?? '—'}
              </Text>
            )}
          </View>
          {lastChecked && (
            <>
              <View style={s.divider} />
              <View style={s.row}>
                <Text style={s.label}>Last Checked</Text>
                <Text style={s.valueSmall}>{lastChecked}</Text>
              </View>
            </>
          )}
        </View>

        {checkError ? (
          <View style={s.statusBanner}>
            <Text style={s.statusError}>Unable to check — {checkError}</Text>
          </View>
        ) : updateAvailable && release ? (
          <View style={s.updateBanner}>
            <Text style={s.updateTitle}>Version {release.version} available</Text>
            <Text style={s.updateMeta}>
              {release.size} · Released{' '}
              {new Date(release.releasedAt).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
              })}
            </Text>
            {release.changelog.length > 0 && (
              <View style={s.changelogBox}>
                {release.changelog.map((entry, i) => (
                  <Text key={i} style={s.changelogItem}>
                    • {entry}
                  </Text>
                ))}
              </View>
            )}
            <TouchableOpacity
              style={s.downloadBtn}
              onPress={handleDownloadUpdate}
              activeOpacity={0.85}
            >
              <Text style={s.downloadBtnText}>Download & Install</Text>
            </TouchableOpacity>
          </View>
        ) : !checking ? (
          <View style={s.statusBanner}>
            <Text style={s.statusOk}>✓ You&apos;re on the latest version</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={s.outlineBtnFull}
          onPress={checkForUpdate}
          disabled={checking}
          activeOpacity={0.85}
        >
          {checking ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={s.outlineBtnText}>Check for Updates</Text>
          )}
        </TouchableOpacity>

        {/* ═══════ Device Info ═══════ */}
        <Text style={[s.sectionTitle, { marginTop: 32 }]}>Device Info</Text>

        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.label}>Role</Text>
            <View style={[s.roleBadge, identity?.role === 'pos' && s.rolePOS]}>
              <Text style={s.roleBadgeText}>{identity?.role?.toUpperCase() ?? '—'}</Text>
            </View>
          </View>

          {/* v2.7.26 — merchant / location / device are now pushed by the
              server (see services/auth devices/config → identity block).
              Fall back to the local device-store labels when the server
              version is older. */}
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Merchant</Text>
            <Text style={s.value}>{serverConfig?.identity?.orgName ?? '—'}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Location</Text>
            <Text style={s.value}>{serverConfig?.identity?.locationName ?? '—'}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Device</Text>
            <Text style={s.value}>
              {serverConfig?.identity?.deviceLabel ?? identity?.label ?? '—'}
            </Text>
          </View>

          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Location ID</Text>
            <Text style={s.value}>{truncate(identity?.locationId)}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Device ID</Text>
            <Text style={s.value}>{truncate(identity?.deviceId)}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Register ID</Text>
            <Text style={s.value}>{truncate(identity?.registerId)}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Payment Terminal</Text>
            <Text style={[s.value, { color: serverConfig?.terminal ? '#22c55e' : '#666' }]}>
              {serverConfig?.terminal
                ? serverConfig.terminal.provider === 'anz'
                  ? `ANZ Worldline (${serverConfig.terminal.terminalIp ?? '—'})`
                  : serverConfig.terminal.provider === 'tyro'
                    ? 'Tyro'
                    : serverConfig.terminal.provider
                : 'Not assigned'}
            </Text>
          </View>
          {!serverConfig?.terminal && serverConfig && (
            <>
              <View style={s.divider} />
              <View style={{ padding: 10, backgroundColor: 'rgba(245, 158, 11, 0.08)', borderRadius: 8, marginTop: 4 }}>
                <Text style={{ color: '#f59e0b', fontSize: 12, fontWeight: '600' }}>
                  No terminal assigned to this device
                </Text>
                <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 4, lineHeight: 15 }}>
                  Each device needs its own payment terminal in the back-office.
                  Go to Dashboard → Devices → select this device → Assign Terminal.
                  Until assigned, card payments are disabled on this register.
                </Text>
              </View>
            </>
          )}
        </View>

        <TouchableOpacity style={s.unpairBtn} onPress={handleUnpair} activeOpacity={0.85}>
          <Text style={s.unpairBtnText}>Unpair Device</Text>
        </TouchableOpacity>
        <Text style={s.warning}>
          Unpairing will require a new pairing code from the back-office.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ═══════════ Manage Products / Categories Modal ═══════════ */}
      <Modal
        visible={showManageModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowManageModal(false)}
      >
        <View style={s.modalWrap}>
          <View style={s.modalPane}>
            {/* Modal header */}
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {managingProducts ? 'Products' : 'Categories'}
              </Text>
              <TouchableOpacity onPress={() => setShowManageModal(false)}>
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            {/* Tab switcher + Add button */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12, gap: 8 }}>
              <TouchableOpacity
                style={[s.tab, managingProducts && s.tabActive]}
                onPress={() => setManagingProducts(true)}
              >
                <Text style={[s.tabText, managingProducts && s.tabTextActive]}>Products</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tab, !managingProducts && s.tabActive]}
                onPress={() => setManagingProducts(false)}
              >
                <Text style={[s.tabText, !managingProducts && s.tabTextActive]}>Categories</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#6366f1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}
                onPress={managingProducts ? openAddProduct : openAddCategory}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Add</Text>
              </TouchableOpacity>
            </View>

            {/* Content */}
            {managingProducts ? (
              <FlatList
                data={products}
                keyExtractor={(p) => p.id}
                contentContainerStyle={{ paddingBottom: 20 }}
                renderItem={({ item }) => (
                  <TouchableOpacity style={s.manageRow} onPress={() => openEditProduct(item)} activeOpacity={0.6}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.manageName} numberOfLines={1}>{item.name}</Text>
                      <Text style={s.manageSub}>
                        ${parseFloat(item.basePrice || '0').toFixed(2)}
                        {item.sku ? ` · ${item.sku}` : ''}
                        {item.categoryId ? ` · ${categories.find(c => c.id === item.categoryId)?.name ?? ''}` : ''}
                      </Text>
                    </View>
                    {toggling === item.id ? (
                      <ActivityIndicator size="small" color="#6366f1" />
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Switch
                          value={item.isActive}
                          onValueChange={() => toggleProductAvailability(item)}
                          trackColor={{ false: '#2a2a3a', true: '#6366f180' }}
                          thumbColor={item.isActive ? '#6366f1' : '#555'}
                        />
                        <Ionicons name="chevron-forward" size={16} color="#444" />
                      </View>
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={s.emptyList}>
                    <Ionicons name="cube-outline" size={32} color="#444" />
                    <Text style={s.emptyListText}>No products yet</Text>
                    <TouchableOpacity style={{ marginTop: 12, backgroundColor: '#6366f1', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }} onPress={openAddProduct}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Add First Product</Text>
                    </TouchableOpacity>
                  </View>
                }
              />
            ) : (
              <FlatList
                data={categories}
                keyExtractor={(c) => c.id}
                contentContainerStyle={{ paddingBottom: 20 }}
                renderItem={({ item, index }) => (
                  <TouchableOpacity style={s.manageRow} onPress={() => openEditCategory(item)} activeOpacity={0.6}>
                    <View style={[s.catDot, { backgroundColor: item.color ?? ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'][index % 5] }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.manageName}>{item.name}</Text>
                      <Text style={s.manageSub}>
                        {(item as any).printerDestination ? `Printer: ${(item as any).printerDestination}` : ''}
                        {(item as any).kdsDestination ? ` · KDS: ${(item as any).kdsDestination}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#444" />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={s.emptyList}>
                    <Ionicons name="grid-outline" size={32} color="#444" />
                    <Text style={s.emptyListText}>No categories yet</Text>
                    <TouchableOpacity style={{ marginTop: 12, backgroundColor: '#6366f1', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }} onPress={openAddCategory}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Add First Category</Text>
                    </TouchableOpacity>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ═══════════ Add/Edit Product Modal ═══════════ */}
      <Modal visible={showAddProduct} transparent animationType="fade" onRequestClose={() => setShowAddProduct(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { width: 420 }]}>
            <Text style={s.modalTitle}>{editingProduct ? 'Edit Product' : 'Add Product'}</Text>

            <Text style={s.inputLabel}>Name *</Text>
            <TextInput style={s.input} value={prodForm.name} onChangeText={v => setProdForm(p => ({ ...p, name: v }))} placeholder="e.g. Burger" placeholderTextColor="#555" />

            <Text style={s.inputLabel}>Price (incl. GST) *</Text>
            <TextInput style={s.input} value={prodForm.basePrice} onChangeText={v => setProdForm(p => ({ ...p, basePrice: v }))} placeholder="15.00" placeholderTextColor="#555" keyboardType="decimal-pad" />

            <Text style={s.inputLabel}>SKU</Text>
            <TextInput style={s.input} value={prodForm.sku} onChangeText={v => setProdForm(p => ({ ...p, sku: v }))} placeholder="Auto-generated if blank" placeholderTextColor="#555" />

            <Text style={s.inputLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  style={[s.typeBtn, !prodForm.categoryId && s.typeBtnActive]}
                  onPress={() => setProdForm(p => ({ ...p, categoryId: '' }))}
                >
                  <Text style={[s.typeBtnText, !prodForm.categoryId && s.typeBtnTextActive]}>None</Text>
                </TouchableOpacity>
                {categories.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[s.typeBtn, prodForm.categoryId === c.id && s.typeBtnActive]}
                    onPress={() => setProdForm(p => ({ ...p, categoryId: c.id }))}
                  >
                    <View style={[s.catDot, { backgroundColor: c.color ?? '#6366f1', marginRight: 0 }]} />
                    <Text style={[s.typeBtnText, prodForm.categoryId === c.id && s.typeBtnTextActive]}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <TouchableOpacity style={[s.outlineBtn]} onPress={() => setShowAddProduct(false)}>
                <Text style={s.outlineBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.outlineBtn, { backgroundColor: '#6366f1', borderColor: '#6366f1' }]} onPress={saveProduct} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[s.outlineBtnText, { color: '#fff' }]}>{editingProduct ? 'Update' : 'Add Product'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══════════ Add/Edit Category Modal ═══════════ */}
      <Modal visible={showAddCategory} transparent animationType="fade" onRequestClose={() => setShowAddCategory(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { width: 420 }]}>
            <Text style={s.modalTitle}>{editingCategory ? 'Edit Category' : 'Add Category'}</Text>

            <Text style={s.inputLabel}>Name *</Text>
            <TextInput style={s.input} value={catForm.name} onChangeText={v => setCatForm(p => ({ ...p, name: v }))} placeholder="e.g. Drinks" placeholderTextColor="#555" />

            <Text style={s.inputLabel}>Color</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
              {COLOR_OPTIONS.map(c => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setCatForm(p => ({ ...p, color: c }))}
                  style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: catForm.color === c ? 3 : 0, borderColor: '#fff' }}
                />
              ))}
            </View>

            <Text style={s.inputLabel}>Printer Destination</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {DEST_OPTIONS.map(d => (
                  <TouchableOpacity key={d} style={[s.typeBtn, catForm.printerDestination === d && s.typeBtnActive]} onPress={() => setCatForm(p => ({ ...p, printerDestination: d }))}>
                    <Text style={[s.typeBtnText, catForm.printerDestination === d && s.typeBtnTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={s.inputLabel}>KDS Destination</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {DEST_OPTIONS.map(d => (
                  <TouchableOpacity key={d} style={[s.typeBtn, catForm.kdsDestination === d && s.typeBtnActive]} onPress={() => setCatForm(p => ({ ...p, kdsDestination: d }))}>
                    <Text style={[s.typeBtnText, catForm.kdsDestination === d && s.typeBtnTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={s.inputLabel}>Sort Order</Text>
            <TextInput style={s.input} value={catForm.sortOrder} onChangeText={v => setCatForm(p => ({ ...p, sortOrder: v }))} keyboardType="number-pad" placeholderTextColor="#555" />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <TouchableOpacity style={[s.outlineBtn]} onPress={() => setShowAddCategory(false)}>
                <Text style={s.outlineBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.outlineBtn, { backgroundColor: '#6366f1', borderColor: '#6366f1' }]} onPress={saveCategory} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[s.outlineBtnText, { color: '#fff' }]}>{editingCategory ? 'Update' : 'Add Category'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══════════ Printer Config Modal ═══════════ */}
      <Modal
        visible={showPrinterModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPrinterModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Configure Printer</Text>

            {/* Printer Name */}
            <Text style={s.inputLabel}>Printer Name</Text>
            <TextInput
              style={s.input}
              value={editPrinter.name}
              onChangeText={(t) => setEditPrinter((p) => ({ ...p, name: t }))}
              placeholder="e.g. Kitchen Printer"
              placeholderTextColor="#444"
            />

            {/* Connection Type */}
            <Text style={s.inputLabel}>Connection Type</Text>
            <View style={s.typeRow}>
              {(['network', 'usb', 'bluetooth'] as PrinterConnectionType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[s.typeBtn, editPrinter.type === t && s.typeBtnActive]}
                  onPress={() => setEditPrinter((p) => ({ ...p, type: t }))}
                >
                  <Ionicons
                    name={
                      t === 'network'
                        ? 'wifi'
                        : t === 'usb'
                          ? 'hardware-chip-outline'
                          : 'bluetooth'
                    }
                    size={16}
                    color={editPrinter.type === t ? '#fff' : '#888'}
                  />
                  <Text
                    style={[
                      s.typeBtnText,
                      editPrinter.type === t && s.typeBtnTextActive,
                    ]}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Address */}
            <Text style={s.inputLabel}>
              {editPrinter.type === 'network' ? 'IP Address : Port' : 'Device Address'}
            </Text>
            <TextInput
              style={s.input}
              value={editPrinter.address}
              onChangeText={(t) => setEditPrinter((p) => ({ ...p, address: t }))}
              placeholder={
                editPrinter.type === 'network' ? '192.168.1.100:9100' : 'Device path'
              }
              placeholderTextColor="#444"
              autoCapitalize="none"
            />

            {/* Paper Width */}
            <Text style={s.inputLabel}>Paper Width</Text>
            <View style={s.typeRow}>
              {([58, 80] as const).map((w) => (
                <TouchableOpacity
                  key={w}
                  style={[s.typeBtn, editPrinter.paperWidth === w && s.typeBtnActive]}
                  onPress={() => setEditPrinter((p) => ({ ...p, paperWidth: w }))}
                >
                  <Text
                    style={[
                      s.typeBtnText,
                      editPrinter.paperWidth === w && s.typeBtnTextActive,
                    ]}
                  >
                    {w}mm
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Auto-print */}
            <View style={s.switchRow}>
              <Text style={s.switchLabel}>Auto-print receipts</Text>
              <Switch
                value={editPrinter.autoPrint}
                onValueChange={(v) => setEditPrinter((p) => ({ ...p, autoPrint: v }))}
                trackColor={{ false: '#2a2a3a', true: '#6366f180' }}
                thumbColor={editPrinter.autoPrint ? '#6366f1' : '#555'}
              />
            </View>

            {/* Actions */}
            <TouchableOpacity style={s.saveBtn} onPress={savePrinterConfig} activeOpacity={0.85}>
              <Text style={s.saveBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={() => setShowPrinterModal(false)}
              activeOpacity={0.85}
            >
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══════════ Sidebar Customise Modal ═══════════ */}
      <Modal
        visible={showSidebarModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSidebarModal(false)}
      >
        <View style={s.modalWrap}>
          <View style={s.modalPane}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Customise Sidebar</Text>
              <TouchableOpacity onPress={() => setShowSidebarModal(false)}>
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>
            <Text style={{ color: '#555', fontSize: 13, paddingHorizontal: 20, marginBottom: 12 }}>
              Choose which shortcuts appear in the left sidebar. Sell and More are always visible.
            </Text>
            {ALL_SIDEBAR_ITEMS.map((item) => {
              const enabled = sidebarEnabledIds.includes(item.id);
              return (
                <View key={item.id} style={[s.manageRow, { paddingHorizontal: 20 }]}>
                  <Ionicons
                    name={item.icon as any}
                    size={20}
                    color={enabled ? '#6366f1' : '#555'}
                    style={{ marginRight: 12 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.manageName, { color: item.permanent ? '#888' : '#ccc' }]}>
                      {item.label}
                      {item.permanent ? '  (required)' : ''}
                    </Text>
                  </View>
                  <Switch
                    value={enabled}
                    onValueChange={() => toggleSidebarItem(item.id)}
                    disabled={!!item.permanent}
                    trackColor={{ false: '#2a2a3a', true: '#6366f180' }}
                    thumbColor={enabled ? '#6366f1' : '#555'}
                  />
                </View>
              );
            })}
            <TouchableOpacity
              style={{ marginHorizontal: 20, marginTop: 16, paddingVertical: 12, alignItems: 'center' }}
              onPress={() => resetSidebar()}
              activeOpacity={0.7}
            >
              <Text style={{ color: '#555', fontSize: 13, fontWeight: '600' }}>Reset to defaults</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  content: { flex: 1, padding: 24 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 16 },

  /* ── Card ── */
  card: {
    backgroundColor: '#141425',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  divider: { height: 1, backgroundColor: '#1e1e2e', marginHorizontal: 16 },
  label: { fontSize: 14, color: '#777' },
  value: { fontSize: 14, color: '#ccc', fontWeight: '500' },
  valueSmall: { fontSize: 13, color: '#666', fontWeight: '400' },

  /* ── Employee ── */
  empAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderWidth: 1,
    borderColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empAvatarText: { fontSize: 14, fontWeight: '800', color: '#6366f1' },
  switchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(99,102,241,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.25)',
  },

  /* ── Clock ── */
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeActive: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
  },
  statusBadgeInactive: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusBadgeText: { fontSize: 13, fontWeight: '700' },

  btnRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  clockInBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#22c55e',
    borderRadius: 14,
    paddingVertical: 16,
  },
  clockInBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  clockOutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#ef4444',
  },
  clockOutBtnText: { fontSize: 15, fontWeight: '700', color: '#ef4444' },
  breakBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#f59e0b',
  },
  breakBtnText: { fontSize: 15, fontWeight: '700', color: '#f59e0b' },

  errorNote: {
    fontSize: 13,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 8,
    paddingVertical: 4,
  },

  /* ── Quick Manage ── */
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuRowText: { fontSize: 15, fontWeight: '600', color: '#ccc' },
  menuRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuRowCount: { fontSize: 13, color: '#666', fontWeight: '500' },
  menuRowSub: { fontSize: 12, color: '#555', fontWeight: '500' },

  /* ── Generic outline button ── */
  outlineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1e1e2e',
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  outlineBtnFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1e1e2e',
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    marginBottom: 8,
  },
  outlineBtnText: { fontSize: 15, fontWeight: '600', color: '#ccc' },

  /* ── Update ── */
  updateHighlight: { color: '#6366f1', fontWeight: '700' },
  updateBanner: {
    backgroundColor: 'rgba(99,102,241,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.25)',
    padding: 16,
    marginBottom: 12,
  },
  updateTitle: { fontSize: 16, fontWeight: '700', color: '#6366f1', marginBottom: 4 },
  updateMeta: { fontSize: 13, color: '#888', marginBottom: 10 },
  changelogBox: {
    backgroundColor: 'rgba(99,102,241,0.06)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  changelogItem: { fontSize: 13, color: '#aaa', lineHeight: 20 },
  downloadBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  downloadBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  statusBanner: {
    backgroundColor: '#141425',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  statusOk: { fontSize: 14, color: '#10b981', fontWeight: '600' },
  statusError: { fontSize: 13, color: '#ef4444', fontWeight: '500' },

  /* ── Role badge ── */
  roleBadge: {
    backgroundColor: '#2a2a3a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rolePOS: {
    backgroundColor: 'rgba(99,102,241,0.2)',
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  roleBadgeText: { fontSize: 13, fontWeight: '800', color: '#6366f1' },

  /* ── Unpair ── */
  unpairBtn: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ef4444',
    marginBottom: 12,
    marginTop: 16,
  },
  unpairBtnText: { fontSize: 16, fontWeight: '700', color: '#ef4444' },
  warning: { fontSize: 13, color: '#555', textAlign: 'center', lineHeight: 18 },

  /* ════════ Manage Modal ════════ */
  modalWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalPane: {
    backgroundColor: '#141425',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 10,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },

  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 12 },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#1e1e2e',
  },
  tabActive: { backgroundColor: '#6366f1' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#888' },
  tabTextActive: { color: '#fff' },

  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  manageName: { fontSize: 14, fontWeight: '600', color: '#ccc', flex: 1 },
  manageSub: { fontSize: 12, color: '#666', marginTop: 2 },
  manageOrder: { fontSize: 12, color: '#555', fontWeight: '500' },
  catDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },

  emptyList: { alignItems: 'center', paddingVertical: 40 },
  emptyListText: { fontSize: 14, color: '#555' },

  /* ════════ Printer Modal ════════ */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#141425',
    borderRadius: 20,
    padding: 24,
    width: 400,
    maxWidth: '92%',
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#777', marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: '#1e1e2e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#ccc',
  },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1e1e2e',
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  typeBtnActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  typeBtnText: { fontSize: 13, fontWeight: '600', color: '#888' },
  typeBtnTextActive: { color: '#fff' },

  /* ── Segmented control (3-way switch for receipt prefs) ── */
  segRow: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#0d0d14',
    padding: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  segBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1e1e2e',
  },
  segBtnActive: { backgroundColor: '#6366f1' },
  segBtnText: { fontSize: 13, fontWeight: '600', color: '#888' },
  segBtnTextActive: { color: '#fff' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingVertical: 4,
  },
  switchLabel: { fontSize: 14, color: '#ccc' },
  saveBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#666' },
});
