/**
 * Device settings store — server-managed configuration.
 *
 * Fetches the unified device config from GET /api/v1/devices/config
 * (auth service) so payment terminal, network printers, and customer
 * display settings are configured ONCE in the dashboard and shared
 * across the browser POS and all mobile apps.
 *
 * This store is in-memory only (no SecureStore) — settings are always
 * authoritative from the server and refreshed on each app open.
 */

import { create } from 'zustand';
import { deviceApiFetch } from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ServerTerminalConfig {
  provider: 'anz' | 'tyro';
  // ANZ
  terminalIp?: string;
  /** WebSocket port — ANZ TIM API default is 80 */
  terminalPort?: number;
  /** Integrator ID issued by ANZ Worldline to ElevatedPOS */
  integratorId?: string;
  enableSurcharge?: boolean;
  enableTipping?: boolean;
  // Tyro
  apiKey?: string;
  merchantId?: string;
  terminalId?: string;
  testMode?: boolean;
  tyroHandlesSurcharge?: boolean;
}

export interface ServerNetworkPrinter {
  id: string;
  name: string;
  host: string;
  port: number;
  paperWidth: 58 | 80;
}

export interface ServerCustomerDisplay {
  welcomeMessage: string;
  thankYouMessage: string;
  showLogo: boolean;
  showLineItems: boolean;
  showGst: boolean;
}

/**
 * v2.7.26 — server-pushed identity block so the More page + receipts can
 * render Merchant / Location / Device without extra lookups. Populated on
 * the current backend; may be null against older server builds.
 */
export type Industry = 'retail' | 'hospitality' | 'pharmacy' | 'services';

export interface ServerIdentity {
  orgId: string;
  orgName: string | null;
  /**
   * v2.7.44 — drives feature gating on the mobile app.
   * Hospitality merchants get the Eat-In/Takeaway/Delivery picker on
   * Sell + Quick-Sale; non-hospitality merchants skip the kiosk's
   * order-type prompt entirely. Older server builds may omit this
   * field, in which case we default to 'retail' to preserve the
   * existing retail-only behaviour.
   */
  industry: Industry;
  locationId: string;
  locationName: string | null;
  locationPhone: string | null;
  locationAddress1: string | null;
  locationAddress2: string | null;
  deviceId: string;
  deviceLabel: string | null;
  deviceRole: string;
  registerId: string | null;
}

interface DeviceConfig {
  identity?: ServerIdentity | null;
  terminal: ServerTerminalConfig | null;
  networkPrinters: {
    receipt: ServerNetworkPrinter | null;
    order: ServerNetworkPrinter | null;
  };
  customerDisplay: ServerCustomerDisplay;
}

interface DeviceSettingsState {
  config: DeviceConfig | null;
  /** True once the first fetch has completed (success or failure) */
  loaded: boolean;
  fetch: () => Promise<void>;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_DISPLAY: ServerCustomerDisplay = {
  welcomeMessage: 'Welcome!',
  thankYouMessage: 'Thank you for your order!',
  showLogo: false,
  showLineItems: true,
  showGst: true,
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useDeviceSettings = create<DeviceSettingsState>((set) => ({
  config: null,
  loaded: false,

  fetch: async () => {
    try {
      const res = await deviceApiFetch<{ data: DeviceConfig }>('/api/v1/devices/config');
      set({ config: res.data, loaded: true });
    } catch {
      // Non-fatal: the app still works, payments fall back to local config
      set({ loaded: true });
    }
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the ANZ terminal config if that provider is configured server-side. */
export function getServerAnzConfig(): (ServerTerminalConfig & { provider: 'anz'; terminalIp: string }) | null {
  const cfg = useDeviceSettings.getState().config?.terminal;
  if (cfg?.provider === 'anz' && cfg.terminalIp) {
    return cfg as ServerTerminalConfig & { provider: 'anz'; terminalIp: string };
  }
  return null;
}

/** True if ANZ is configured AND the integrator ID is available (SDK can be initialised). */
export function isAnzFullyConfigured(): boolean {
  const cfg = getServerAnzConfig();
  return !!(cfg?.terminalIp && cfg.integratorId);
}

/** Returns the Tyro terminal config if that provider is configured server-side. */
export function getServerTyroConfig(): (ServerTerminalConfig & { provider: 'tyro' }) | null {
  const cfg = useDeviceSettings.getState().config?.terminal;
  if (cfg?.provider === 'tyro') {
    return cfg as ServerTerminalConfig & { provider: 'tyro' };
  }
  return null;
}

/** Returns the network receipt printer if one is configured in the dashboard. */
export function getServerReceiptPrinter(): ServerNetworkPrinter | null {
  return useDeviceSettings.getState().config?.networkPrinters.receipt ?? null;
}

/** Returns the network order printer if one is configured in the dashboard. */
export function getServerOrderPrinter(): ServerNetworkPrinter | null {
  return useDeviceSettings.getState().config?.networkPrinters.order ?? null;
}

/** Returns the customer display settings from the dashboard. */
export function getServerCustomerDisplay(): ServerCustomerDisplay {
  return useDeviceSettings.getState().config?.customerDisplay ?? DEFAULT_DISPLAY;
}

/** Returns the server-pushed identity (merchant / location / device). */
export function getServerIdentity(): ServerIdentity | null {
  return useDeviceSettings.getState().config?.identity ?? null;
}

/**
 * True when the backend has explicitly assigned a payment terminal to
 * THIS device. A null terminal means the dashboard hasn't set up a
 * terminal for the device yet; the POS should NOT silently borrow
 * another device's terminal (that's what v2.7.25 and earlier did,
 * causing device B to pick up device A's terminal config).
 */
export function hasAssignedTerminal(): boolean {
  return useDeviceSettings.getState().config?.terminal !== null &&
         useDeviceSettings.getState().config?.terminal !== undefined;
}
