import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

export type DeviceRole = 'pos' | 'kds' | 'kiosk' | 'dashboard';

export interface DeviceIdentity {
  deviceId: string;
  deviceToken: string;
  role: DeviceRole;
  locationId: string;
  registerId: string | null;
  orgId: string;
  label: string | null;
}

export interface DeviceLocation {
  id: string;
  name: string;
  type: string;
}

interface DeviceStore {
  identity: DeviceIdentity | null;
  /**
   * Runtime override for the active location. When set (via the KDS location
   * picker for multi-location orgs), this takes precedence over
   * `identity.locationId` for things like WebSocket subscriptions. It is
   * persisted to SecureStore so the selection survives app restarts.
   */
  activeLocationId: string | null;
  /** Cached list of the org's available locations. */
  availableLocations: DeviceLocation[];
  /** true once _hydrate() has resolved — gate rendering on this */
  ready: boolean;
  _hydrate: () => Promise<void>;
  setIdentity: (identity: DeviceIdentity) => Promise<void>;
  clearIdentity: () => Promise<void>;
  /** Check if device is still valid (not revoked). Call periodically. */
  checkHeartbeat: () => Promise<void>;
  /** Fetch the list of locations the device's org has access to. */
  fetchAvailableLocations: () => Promise<DeviceLocation[]>;
  /** Override the active location id for this session (persisted). */
  setActiveLocationId: (id: string | null) => Promise<void>;
}

const KEYS = {
  deviceId: 'elevatedpos_device_id',
  deviceToken: 'elevatedpos_device_token',
  role: 'elevatedpos_device_role',
  locationId: 'elevatedpos_location_id',
  registerId: 'elevatedpos_register_id',
  orgId: 'elevatedpos_org_id',
  label: 'elevatedpos_device_label',
  activeLocationId: 'elevatedpos_active_location_id',
} as const;

export const useDeviceStore = create<DeviceStore>((set) => ({
  identity: null,
  activeLocationId: null,
  availableLocations: [],
  ready: false,

  _hydrate: async () => {
    try {
      const [deviceId, deviceToken, role, locationId, registerId, orgId, label, activeLocationId] =
        await Promise.all([
          SecureStore.getItemAsync(KEYS.deviceId),
          SecureStore.getItemAsync(KEYS.deviceToken),
          SecureStore.getItemAsync(KEYS.role),
          SecureStore.getItemAsync(KEYS.locationId),
          SecureStore.getItemAsync(KEYS.registerId),
          SecureStore.getItemAsync(KEYS.orgId),
          SecureStore.getItemAsync(KEYS.label),
          SecureStore.getItemAsync(KEYS.activeLocationId),
        ]);

      if (
        deviceId && deviceToken &&
        (role === 'pos' || role === 'kds' || role === 'kiosk' || role === 'dashboard') &&
        locationId && orgId
      ) {
        set({
          identity: {
            deviceId, deviceToken, role, locationId,
            registerId: registerId || null,
            orgId,
            label: label || null,
          },
          activeLocationId: activeLocationId || null,
          ready: true,
        });
      } else {
        set({ identity: null, activeLocationId: null, ready: true });
      }
    } catch {
      set({ identity: null, activeLocationId: null, ready: true });
    }
  },

  setIdentity: async (identity: DeviceIdentity) => {
    await Promise.all([
      SecureStore.setItemAsync(KEYS.deviceId, identity.deviceId),
      SecureStore.setItemAsync(KEYS.deviceToken, identity.deviceToken),
      SecureStore.setItemAsync(KEYS.role, identity.role),
      SecureStore.setItemAsync(KEYS.locationId, identity.locationId),
      SecureStore.setItemAsync(KEYS.registerId, identity.registerId ?? ''),
      SecureStore.setItemAsync(KEYS.orgId, identity.orgId),
      SecureStore.setItemAsync(KEYS.label, identity.label ?? ''),
    ]);
    set({ identity });
  },

  clearIdentity: async () => {
    await Promise.all(Object.values(KEYS).map((k) => SecureStore.deleteItemAsync(k)));
    set({ identity: null, activeLocationId: null, availableLocations: [] });
  },

  /** Check if device is still valid (not revoked). Call periodically. */
  checkHeartbeat: async () => {
    const { identity } = useDeviceStore.getState();
    if (!identity) return;
    const API_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? '';
    try {
      const res = await fetch(`${API_BASE}/api/v1/devices/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${identity.deviceToken}`,
        },
      });
      if (res.status === 401 || res.status === 403) {
        // Device has been revoked — clear identity to force re-pair
        await useDeviceStore.getState().clearIdentity();
      }
    } catch {
      // Network error — don't clear on connectivity issues
    }
  },

  fetchAvailableLocations: async () => {
    const { identity } = useDeviceStore.getState();
    if (!identity) return [];
    const API_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? '';
    try {
      const res = await fetch(`${API_BASE}/api/v1/devices/locations`, {
        headers: { Authorization: `Bearer ${identity.deviceToken}` },
      });
      if (!res.ok) return [];
      const json = (await res.json()) as { data?: DeviceLocation[] };
      const locations = json.data ?? [];
      set({ availableLocations: locations });
      return locations;
    } catch {
      return [];
    }
  },

  setActiveLocationId: async (id: string | null) => {
    if (id) {
      await SecureStore.setItemAsync(KEYS.activeLocationId, id);
    } else {
      await SecureStore.deleteItemAsync(KEYS.activeLocationId);
    }
    set({ activeLocationId: id });
  },
}));
