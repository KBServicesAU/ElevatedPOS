/**
 * Hardware Bridge health-check utility.
 *
 * The ElevatedPOS Hardware Bridge runs locally on the merchant's machine
 * (default http://localhost:9999) and provides a WebSocket proxy so that
 * the browser-based POS can reach LAN payment terminals even from an
 * HTTPS origin (which blocks ws:// to non-loopback addresses).
 *
 * This module probes the bridge's /health endpoint and caches the result
 * for the browser session so we don't hit it on every frame.
 */

// ─── Configuration ───────────────────────────────────────────────────────────

const DEFAULT_BRIDGE_PORT = 9999;
const HEALTH_TIMEOUT_MS   = 2_000;

/** How long a positive health result is trusted before re-probing. */
const CACHE_TTL_MS = 60_000; // 1 minute

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BridgeHealth {
  available: boolean;
  /** Terminal proxy feature-flag on the bridge. */
  terminalProxyEnabled: boolean;
  /** e.g. "192.168.1.100:7784" or null if proxy is disabled. */
  terminalTarget: string | null;
  /** Number of active proxy WebSocket sessions. */
  activeConnections: number;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

let cachedResult: BridgeHealth | null = null;
let cachedAt = 0;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the configured bridge port.
 * Could be overridden via an env-var in a self-hosted deployment.
 */
export function getBridgePort(): number {
  if (typeof window !== 'undefined') {
    // Allow the deployer to override via a meta tag or global
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const override = (window as any).__BRIDGE_PORT__;
    if (typeof override === 'number' && override > 0) return override;
  }
  return DEFAULT_BRIDGE_PORT;
}

/** Returns the base URL of the local hardware bridge (HTTP). */
export function getBridgeHttpUrl(): string {
  return `http://localhost:${getBridgePort()}`;
}

/** Returns the base URL of the local hardware bridge (WebSocket). */
export function getBridgeWsUrl(): string {
  return `ws://127.0.0.1:${getBridgePort()}`;
}

/**
 * Probe the local hardware bridge and return its health status.
 * Results are cached for CACHE_TTL_MS.  Pass `force: true` to bypass cache.
 */
export async function checkBridgeHealth(force = false): Promise<BridgeHealth> {
  if (!force && cachedResult && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedResult;
  }

  const unavailable: BridgeHealth = {
    available: false,
    terminalProxyEnabled: false,
    terminalTarget: null,
    activeConnections: 0,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    const res = await fetch(`${getBridgeHttpUrl()}/health`, {
      signal: controller.signal,
      // Explicit no-cache to bypass any service-worker or browser cache
      cache: 'no-store',
    });
    clearTimeout(timer);

    if (!res.ok) {
      cachedResult = unavailable;
      cachedAt = Date.now();
      return unavailable;
    }

    const data = await res.json() as {
      status?: string;
      terminalProxy?: {
        enabled?: boolean;
        target?: string | null;
        activeConnections?: number;
      };
    };

    const proxy = data.terminalProxy;
    const result: BridgeHealth = {
      available: data.status === 'ok',
      terminalProxyEnabled: proxy?.enabled ?? false,
      terminalTarget: proxy?.target ?? null,
      activeConnections: proxy?.activeConnections ?? 0,
    };

    cachedResult = result;
    cachedAt = Date.now();
    return result;
  } catch {
    // Network error, timeout, or bridge not running
    cachedResult = unavailable;
    cachedAt = Date.now();
    return unavailable;
  }
}

/**
 * Quick boolean check: is the bridge running AND is the terminal proxy
 * enabled with a target configured?
 */
export async function isBridgeProxyReady(force = false): Promise<boolean> {
  const h = await checkBridgeHealth(force);
  return h.available && h.terminalProxyEnabled && !!h.terminalTarget;
}

/** Invalidate the cached health result (e.g. after config changes). */
export function clearBridgeHealthCache(): void {
  cachedResult = null;
  cachedAt = 0;
}
