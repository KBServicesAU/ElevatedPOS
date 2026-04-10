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

interface DeviceStore {
  identity: DeviceIdentity | null;
  /** true once _hydrate() has resolved — gate rendering on this */
  ready: boolean;
  _hydrate: () => Promise<void>;
  setIdentity: (identity: DeviceIdentity) => Promise<void>;
  clearIdentity: () => Promise<void>;
  /** Check if device is still valid (not revoked). Call periodically. */
  checkHeartbeat: () => Promise<void>;
}

const KEYS = {
  deviceId: 'elevatedpos_device_id',
  deviceToken: 'elevatedpos_device_token',
  role: 'elevatedpos_device_role',
  locationId: 'elevatedpos_location_id',
  registerId: 'elevatedpos_register_id',
  orgId: 'elevatedpos_org_id',
  label: 'elevatedpos_device_label',
} as const;

export const useDeviceStore = create<DeviceStore>((set) => ({
  identity: null,
  ready: false,

  _hydrate: async () => {
    try {
      const [deviceId, deviceToken, role, locationId, registerId, orgId, label] =
        await Promise.all([
          SecureStore.getItemAsync(KEYS.deviceId),
          SecureStore.getItemAsync(KEYS.deviceToken),
          SecureStore.getItemAsync(KEYS.role),
          SecureStore.getItemAsync(KEYS.locationId),
          SecureStore.getItemAsync(KEYS.registerId),
          SecureStore.getItemAsync(KEYS.orgId),
          SecureStore.getItemAsync(KEYS.label),
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
          ready: true,
        });
      } else {
        set({ identity: null, ready: true });
      }
    } catch {
      set({ identity: null, ready: true });
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
    set({ identity: null });
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
}));
