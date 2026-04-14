import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Ionicons } from '@expo/vector-icons';
import { useDeviceStore, type DeviceLocation } from '../../store/device';

export default function KDSLayout() {
  const router = useRouter();
  const identity             = useDeviceStore((s) => s.identity);
  const ready                = useDeviceStore((s) => s.ready);
  const _hydrate             = useDeviceStore((s) => s._hydrate);
  const activeLocationId     = useDeviceStore((s) => s.activeLocationId);
  const availableLocations   = useDeviceStore((s) => s.availableLocations);
  const fetchAvailableLocations = useDeviceStore((s) => s.fetchAvailableLocations);
  const setActiveLocationId  = useDeviceStore((s) => s.setActiveLocationId);

  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [loadingLocations, setLoadingLocations]     = useState(false);

  // Hydrate the device store on first mount if it hasn't been done yet.
  useEffect(() => {
    if (!ready) _hydrate();
  }, [ready, _hydrate]);

  // Guard: if the device has not been paired (no identity), send to /pair.
  // Also enforce the ROLE_LOCK: a KDS build should never be used by a device
  // that was paired with a different role (e.g. pos or kiosk).
  useEffect(() => {
    if (!ready) return;
    if (!identity) {
      router.replace('/pair');
      return;
    }
    if (identity.role !== 'kds') {
      router.replace('/pair');
    }
  }, [ready, identity, router]);

  // K1 — After pairing (or on first launch), if the org has multiple
  // locations and no active location is selected yet, show a picker so
  // the KDS operator can choose which kitchen/bar station to display.
  useEffect(() => {
    if (!ready || !identity || identity.role !== 'kds') return;

    setLoadingLocations(true);
    fetchAvailableLocations()
      .then((locs) => {
        // Only prompt if there are genuinely multiple locations AND the user
        // hasn't already chosen one (activeLocationId starts null after a fresh pair).
        if (locs.length > 1 && !activeLocationId) {
          setShowLocationPicker(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingLocations(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, identity]);   // intentionally omit activeLocationId so it only runs once per session

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => { ScreenOrientation.unlockAsync(); };
  }, []);

  async function handleSelectLocation(loc: DeviceLocation) {
    await setActiveLocationId(loc.id);
    setShowLocationPicker(false);
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />

      {/* K1 — Location picker modal */}
      <Modal
        visible={showLocationPicker}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          <View style={styles.card}>
            {/* Header */}
            <View style={styles.cardHeader}>
              <Ionicons name="location-outline" size={28} color="#6366f1" style={{ marginBottom: 6 }} />
              <Text style={styles.title}>Select Station Location</Text>
              <Text style={styles.subtitle}>
                Choose which location this KDS displays orders for.
                You can change this later in Settings.
              </Text>
            </View>

            {loadingLocations ? (
              <ActivityIndicator color="#6366f1" style={{ marginVertical: 32 }} />
            ) : (
              <FlatList
                data={availableLocations}
                keyExtractor={(l) => l.id}
                style={styles.list}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.locationRow}
                    onPress={() => void handleSelectLocation(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.locationIcon}>
                      <Ionicons name="storefront-outline" size={18} color="#6366f1" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.locationName}>{item.name}</Text>
                      <Text style={styles.locationMeta}>{item.type}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#4a5568" />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    overflow: 'hidden',
  },
  cardHeader: {
    alignItems: 'center',
    paddingTop: 32,
    paddingHorizontal: 28,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3a',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 19,
  },
  list: {
    maxHeight: 320,
  },
  separator: {
    height: 1,
    backgroundColor: '#1e1e2e',
    marginHorizontal: 20,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 14,
  },
  locationIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#6366f120',
    borderWidth: 1,
    borderColor: '#6366f140',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  locationMeta: {
    fontSize: 12,
    color: '#64748b',
    textTransform: 'capitalize',
  },
});
