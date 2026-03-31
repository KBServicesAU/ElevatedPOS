import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

export type DeviceRole = 'pos' | 'kds' | 'kiosk';

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
  deviceId: 'nexus_device_id',
  deviceToken: 'nexus_device_token',
  role: 'nexus_device_role',
  locationId: 'nexus_location_id',
  registerId: 'nexus_register_id',
  orgId: 'nexus_org_id',
  label: 'nexus_device_label',
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
        (role === 'pos' || role === 'kds' || role === 'kiosk') &&
        locationId && orgId
      ) {
        set({
          identity: { deviceId, deviceToken, role, locationId, registerId, orgId, label },
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
