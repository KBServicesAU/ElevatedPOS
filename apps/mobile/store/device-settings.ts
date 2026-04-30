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
 * v2.7.44 — org-wide receipt rendering preferences pushed by the
 * dashboard's Receipts settings tab. Currently the only field is
 * `showOrderNumber` (default true) but the type is open-ended so
 * future flags can be added on the server without a mobile schema bump.
 */
export interface ServerReceiptSettings {
  showOrderNumber: boolean;
  /**
   * v2.7.48 — base64-encoded 1-bit raster of the business logo. The
   * dashboard pre-rasterises uploaded PNG/SVGs at the printer's pixel
   * width (default 384px for 80mm) so the mobile POS does NOT need a PNG
   * decoder — it just emits the bytes verbatim as part of the GS v 0
   * raster command. `null` / missing = no logo, no rendering attempt.
   */
  logoBase64?: string | null;
  /** Pixel width of the rasterised logo (multiple of 8). */
  logoWidth?: number | null;
  /** Pixel height of the rasterised logo. */
  logoHeight?: number | null;
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
  // v2.7.96 — per-org module toggles. Passed through from the auth
  // service's GET /devices/me/settings response. Used by the POS
  // sidebar to decide whether to show Online Orders / Reservations /
  // Bookings / Ecommerce regardless of industry, so a retail merchant
  // who turns Bookings on in /dashboard/web-store sees the tab on the
  // iMin. Older auth builds may not include this — the consumer must
  // tolerate undefined.
  featureFlags?: Record<string, boolean>;
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
  /** v2.7.44 — receipt-rendering toggles (org-wide). May be missing on older backends. */
  receiptSettings?: ServerReceiptSettings;
}

interface DeviceSettingsState {
  config: DeviceConfig | null;
  /** True once the first fetch has completed (success or failure) */
  loaded: boolean;
  /** Epoch ms of the last successful fetch — used by `ensureFreshSettings`. */
  lastFetchedAt: number | null;
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

const DEFAULT_RECEIPT_SETTINGS: ServerReceiptSettings = {
  showOrderNumber: true,
  logoBase64: null,
  logoWidth: null,
  logoHeight: null,
};

/**
 * Considered "fresh" for this many ms — `ensureFreshSettings` skips a
 * round-trip if the last fetch is younger than this. Prevents hammering
 * the auth service on every print while still catching dashboard changes
 * the merchant made within the last minute (typical "I just toggled it,
 * why isn't it on the receipt?" debugging window).
 */
const FRESH_WINDOW_MS = 30_000;

// ── Store ─────────────────────────────────────────────────────────────────────

export const useDeviceSettings = create<DeviceSettingsState>((set) => ({
  config: null,
  loaded: false,
  lastFetchedAt: null,

  fetch: async () => {
    try {
      const res = await deviceApiFetch<{ data: DeviceConfig }>('/api/v1/devices/config');
      // v2.7.51 — surface what showOrderNumber the server returned so a stale
      // mobile after a dashboard toggle can be diagnosed in shipped logs.
      console.log(
        '[receipt-toggle] device-settings fetched showOrderNumber=',
        res.data.receiptSettings?.showOrderNumber,
        ' logoBase64.length=',
        res.data.receiptSettings?.logoBase64?.length ?? 0,
      );
      set({ config: res.data, loaded: true, lastFetchedAt: Date.now() });
    } catch (err) {
      // Non-fatal: the app still works, payments fall back to local config
      console.warn('[receipt-toggle] device-settings fetch failed:', err instanceof Error ? err.message : err);
      set({ loaded: true });
    }
  },
}));

/**
 * Pull the latest config from the auth service, but skip the round-trip
 * if the last successful fetch is younger than {@link FRESH_WINDOW_MS}.
 *
 * Call this immediately before printing a receipt so a dashboard change
 * the merchant just made (e.g. toggling the order-number on/off, uploading
 * a logo) is reflected on the next ticket without forcing them to tap
 * "Sync" on the More page. Best-effort — a fetch failure leaves the
 * cached config alone rather than throwing.
 */
export async function ensureFreshSettings(): Promise<void> {
  const state = useDeviceSettings.getState();
  const last = state.lastFetchedAt;
  if (last && Date.now() - last < FRESH_WINDOW_MS) return;
  try {
    await state.fetch();
  } catch {
    /* best-effort */
  }
}

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

/**
 * Returns the org-wide receipt-rendering settings from the dashboard.
 *
 * v2.7.44 — initial shape `{ showOrderNumber: boolean }` (default true).
 * Falls back to the defaults when the backend doesn't yet return this
 * key (older auth-service builds), so the POS keeps printing as before.
 */
export function getReceiptSettings(): ServerReceiptSettings {
  const cfg = useDeviceSettings.getState().config?.receiptSettings;
  return {
    showOrderNumber: typeof cfg?.showOrderNumber === 'boolean'
      ? cfg.showOrderNumber
      : DEFAULT_RECEIPT_SETTINGS.showOrderNumber,
    logoBase64: typeof cfg?.logoBase64 === 'string' && cfg.logoBase64.length > 0
      ? cfg.logoBase64
      : null,
    logoWidth: typeof cfg?.logoWidth === 'number' ? cfg.logoWidth : null,
    logoHeight: typeof cfg?.logoHeight === 'number' ? cfg.logoHeight : null,
  };
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
