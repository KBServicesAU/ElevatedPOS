import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

export type DeviceRole = 'pos' | 'kds' | 'kiosk' | 'dashboard' | 'display';

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
    // 5-second timeout: if SecureStore hangs (can happen on some iMin/custom
    // Android ROMs with locked keystores), fall through so ready=true fires
    // and the pair screen shows instead of a permanent blank/splash screen.
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 5000),
    );

    try {
      const result = await Promise.race([
        Promise.all([
          SecureStore.getItemAsync(KEYS.deviceId),
          SecureStore.getItemAsync(KEYS.deviceToken),
          SecureStore.getItemAsync(KEYS.role),
          SecureStore.getItemAsync(KEYS.locationId),
          SecureStore.getItemAsync(KEYS.registerId),
          SecureStore.getItemAsync(KEYS.orgId),
          SecureStore.getItemAsync(KEYS.label),
          SecureStore.getItemAsync(KEYS.activeLocationId),
        ]),
        timeout,
      ]);

      // Timeout fired — treat as no stored identity so pair screen shows.
      if (result === null) {
        set({ identity: null, activeLocationId: null, ready: true });
        return;
      }

      const [deviceId, deviceToken, role, locationId, registerId, orgId, label, activeLocationId] = result;

      if (
        deviceId && deviceToken &&
        (role === 'pos' || role === 'kds' || role === 'kiosk' || role === 'dashboard' || role === 'display') &&
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
      // Primary check: GET /api/v1/devices/me/status returns { status: 'active' | 'revoked' }
      const statusRes = await fetch(`${API_BASE}/api/v1/devices/me/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${identity.deviceToken}`,
        },
      });
      if (statusRes.status === 401 || statusRes.status === 403) {
        await useDeviceStore.getState().clearIdentity();
        return;
      }
      if (statusRes.ok) {
        const data = await statusRes.json().catch(() => ({})) as { status?: string };
        if (data.status === 'revoked') {
          await useDeviceStore.getState().clearIdentity();
          return;
        }
        // Active — no further action needed
        return;
      }
      // Endpoint not available (404 / 5xx) — fall through to legacy heartbeat
    } catch {
      // Network error or endpoint missing — fall through to legacy heartbeat
    }

    // Fallback: POST /api/v1/devices/heartbeat (legacy endpoint)
    try {
      const res = await fetch(`${API_BASE}/api/v1/devices/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${identity.deviceToken}`,
        },
      });
      if (res.status === 401 || res.status === 403) {
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
