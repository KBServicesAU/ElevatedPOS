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
}));
