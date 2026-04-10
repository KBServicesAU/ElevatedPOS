/**
 * Floor plan store — tracks tables, zones, and table status across the POS.
 *
 * Each table belongs to a zone (Dining Room, Patio, Bar, etc.) and has
 * an x/y position on a 1000×1000 virtual canvas. When the dining room
 * screen renders, those positions are scaled to fit the available area.
 *
 * The store also tracks live table status — open/seated/dirty — so the
 * floor plan can colour tables by their state.
 *
 * Persisted to AsyncStorage so the layout survives app restarts. In a
 * future iteration we'll sync to the API.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@elevatedpos/floorplan_v1';

export type TableShape = 'square' | 'round' | 'rect';
export type TableStatus = 'open' | 'seated' | 'dirty' | 'reserved';

export interface FloorTable {
  id: string;
  label: string;
  zoneId: string;
  shape: TableShape;
  /** Position on a virtual 1000×1000 canvas. */
  x: number;
  y: number;
  /** Width/height on the same virtual canvas. */
  width: number;
  height: number;
  /** Number of seats. */
  seats: number;
  status: TableStatus;
  /** Optional currently-attached order id. */
  orderId?: string;
  /** Total of the open ticket on this table, in dollars. */
  openTotal?: number;
  /** When the party was seated, ISO string. */
  seatedAt?: string;
}

export interface FloorZone {
  id: string;
  name: string;
  color: string;
}

interface FloorPlanState {
  zones: FloorZone[];
  tables: FloorTable[];
  hydrated: boolean;
  selectedZoneId: string | null;

  hydrate: () => Promise<void>;

  // Zones
  addZone: (name: string, color?: string) => Promise<FloorZone>;
  removeZone: (id: string) => Promise<void>;
  setSelectedZone: (id: string | null) => void;

  // Tables
  addTable: (zoneId: string, partial?: Partial<FloorTable>) => Promise<FloorTable>;
  updateTable: (id: string, patch: Partial<FloorTable>) => Promise<void>;
  removeTable: (id: string) => Promise<void>;
  setStatus: (id: string, status: TableStatus, extra?: { orderId?: string; openTotal?: number }) => Promise<void>;
  clearTable: (id: string) => Promise<void>;

  // Bulk
  reset: () => Promise<void>;
}

const ZONE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#06b6d4', '#ec4899', '#a855f7'];

function rid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function defaultPlan(): { zones: FloorZone[]; tables: FloorTable[] } {
  const dining: FloorZone = { id: 'z_dining', name: 'Dining Room', color: '#6366f1' };
  const patio: FloorZone = { id: 'z_patio', name: 'Patio', color: '#22c55e' };
  const bar: FloorZone = { id: 'z_bar', name: 'Bar', color: '#f59e0b' };

  // Build a small starter layout so the screen isn't empty on first run.
  const tables: FloorTable[] = [
    { id: rid('t'), label: '1', zoneId: 'z_dining', shape: 'round', x: 120, y: 140, width: 110, height: 110, seats: 2, status: 'open' },
    { id: rid('t'), label: '2', zoneId: 'z_dining', shape: 'round', x: 280, y: 140, width: 110, height: 110, seats: 2, status: 'open' },
    { id: rid('t'), label: '3', zoneId: 'z_dining', shape: 'square', x: 440, y: 130, width: 130, height: 130, seats: 4, status: 'open' },
    { id: rid('t'), label: '4', zoneId: 'z_dining', shape: 'square', x: 620, y: 130, width: 130, height: 130, seats: 4, status: 'open' },
    { id: rid('t'), label: '5', zoneId: 'z_dining', shape: 'rect',   x: 120, y: 320, width: 220, height: 110, seats: 6, status: 'open' },
    { id: rid('t'), label: '6', zoneId: 'z_dining', shape: 'rect',   x: 380, y: 320, width: 220, height: 110, seats: 6, status: 'open' },
    { id: rid('t'), label: '7', zoneId: 'z_dining', shape: 'square', x: 640, y: 320, width: 130, height: 130, seats: 4, status: 'open' },

    { id: rid('t'), label: 'P1', zoneId: 'z_patio', shape: 'round', x: 140, y: 160, width: 120, height: 120, seats: 2, status: 'open' },
    { id: rid('t'), label: 'P2', zoneId: 'z_patio', shape: 'round', x: 320, y: 160, width: 120, height: 120, seats: 2, status: 'open' },
    { id: rid('t'), label: 'P3', zoneId: 'z_patio', shape: 'rect',  x: 500, y: 160, width: 220, height: 110, seats: 6, status: 'open' },

    { id: rid('t'), label: 'B1', zoneId: 'z_bar', shape: 'square', x: 140, y: 180, width: 100, height: 100, seats: 2, status: 'open' },
    { id: rid('t'), label: 'B2', zoneId: 'z_bar', shape: 'square', x: 280, y: 180, width: 100, height: 100, seats: 2, status: 'open' },
    { id: rid('t'), label: 'B3', zoneId: 'z_bar', shape: 'square', x: 420, y: 180, width: 100, height: 100, seats: 2, status: 'open' },
    { id: rid('t'), label: 'B4', zoneId: 'z_bar', shape: 'square', x: 560, y: 180, width: 100, height: 100, seats: 2, status: 'open' },
  ];

  return {
    zones: [dining, patio, bar],
    tables,
  };
}

async function persist(state: { zones: FloorZone[]; tables: FloorTable[] }) {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ zones: state.zones, tables: state.tables }),
    );
  } catch {
    // best effort
  }
}

export const useFloorPlanStore = create<FloorPlanState>((set, get) => ({
  zones: [],
  tables: [],
  hydrated: false,
  selectedZoneId: null,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.zones) && Array.isArray(parsed.tables)) {
          set({
            zones: parsed.zones,
            tables: parsed.tables,
            hydrated: true,
            selectedZoneId: parsed.zones[0]?.id ?? null,
          });
          return;
        }
      }
    } catch {
      // ignore
    }
    // First run — install a default starter plan
    const def = defaultPlan();
    await persist(def);
    set({ ...def, hydrated: true, selectedZoneId: def.zones[0]?.id ?? null });
  },

  addZone: async (name, color) => {
    const z: FloorZone = {
      id: rid('z'),
      name,
      color: color ?? ZONE_COLORS[get().zones.length % ZONE_COLORS.length]!,
    };
    const zones = [...get().zones, z];
    set({ zones });
    await persist({ zones, tables: get().tables });
    return z;
  },

  removeZone: async (id) => {
    const zones = get().zones.filter((z) => z.id !== id);
    const tables = get().tables.filter((t) => t.zoneId !== id);
    set({
      zones,
      tables,
      selectedZoneId: get().selectedZoneId === id ? (zones[0]?.id ?? null) : get().selectedZoneId,
    });
    await persist({ zones, tables });
  },

  setSelectedZone: (id) => set({ selectedZoneId: id }),

  addTable: async (zoneId, partial) => {
    // Find a sensible empty spot — increment by row.
    const existing = get().tables.filter((t) => t.zoneId === zoneId);
    const x = 120 + (existing.length % 4) * 180;
    const y = 140 + Math.floor(existing.length / 4) * 200;
    const t: FloorTable = {
      id: rid('t'),
      label: partial?.label ?? `T${existing.length + 1}`,
      zoneId,
      shape: partial?.shape ?? 'square',
      x: partial?.x ?? x,
      y: partial?.y ?? y,
      width: partial?.width ?? 120,
      height: partial?.height ?? 120,
      seats: partial?.seats ?? 4,
      status: partial?.status ?? 'open',
    };
    const tables = [...get().tables, t];
    set({ tables });
    await persist({ zones: get().zones, tables });
    return t;
  },

  updateTable: async (id, patch) => {
    const tables = get().tables.map((t) => (t.id === id ? { ...t, ...patch } : t));
    set({ tables });
    await persist({ zones: get().zones, tables });
  },

  removeTable: async (id) => {
    const tables = get().tables.filter((t) => t.id !== id);
    set({ tables });
    await persist({ zones: get().zones, tables });
  },

  setStatus: async (id, status, extra) => {
    const tables = get().tables.map((t) =>
      t.id === id
        ? {
            ...t,
            status,
            ...(extra ?? {}),
            seatedAt: status === 'seated' ? new Date().toISOString() : t.seatedAt,
          }
        : t,
    );
    set({ tables });
    await persist({ zones: get().zones, tables });
  },

  clearTable: async (id) => {
    const tables = get().tables.map((t) =>
      t.id === id
        ? { ...t, status: 'open' as TableStatus, orderId: undefined, openTotal: undefined, seatedAt: undefined }
        : t,
    );
    set({ tables });
    await persist({ zones: get().zones, tables });
  },

  reset: async () => {
    const def = defaultPlan();
    set({ ...def, selectedZoneId: def.zones[0]?.id ?? null });
    await persist(def);
  },
}));
