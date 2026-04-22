/**
 * Device access-token manager — v2.7.37
 *
 * Problem this solves:
 *   The opaque device token issued at pair time is NOT a JWT. The auth
 *   service validates it by hashing + DB lookup, but downstream services
 *   (catalog, orders, customers, etc.) use `request.jwtVerify()` which
 *   only accepts real JWTs. Kiosks (which have no employee PIN login)
 *   would fail every catalog/orders call with "Unauthorized" because the
 *   device token isn't a JWT.
 *
 * Fix:
 *   The auth service now exposes `POST /api/v1/devices/access-token`
 *   that swaps the device token for a short-lived (15-min) JWT carrying
 *   the device's org / location / role. This module caches that JWT in
 *   memory, refreshes it before expiry, and exposes a single entry-point
 *   `getDeviceJwt()` so `catalog-api.ts`, the kiosk checkout path, and
 *   any other caller can auth to the downstream services.
 *
 * Lifecycle:
 *   - In-memory only (no SecureStore) — token is short-lived, there's no
 *     benefit to persisting it across app launches. The device token
 *     already survives, and we just mint a new JWT on boot.
 *   - Refreshes ~2 min before expiry so concurrent callers don't all hit
 *     the network; the refresh Promise is memoized so only one refresh
 *     is in flight at a time.
 *   - If refresh fails (network / device revoked), the cached token is
 *     cleared; callers see a normal 401 on the next downstream call.
 */

import { useDeviceStore } from '../store/device';

const BASE_URL = process.env['EXPO_PUBLIC_API_URL'] ?? '';
const REFRESH_SKEW_SECONDS = 120; // refresh 2 min before the token expires

interface CachedJwt {
  token: string;
  expiresAt: number; // epoch ms
}

let cache: CachedJwt | null = null;
let inflight: Promise<string | null> | null = null;

/**
 * Force-refresh the cached device JWT. Rarely needed by callers directly
 * — `getDeviceJwt()` auto-refreshes. Exposed for diagnostic / reset
 * paths.
 */
export async function refreshDeviceJwt(): Promise<string | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const identity = useDeviceStore.getState().identity;
      if (!identity) return null;
      const res = await fetch(`${BASE_URL}/api/v1/devices/access-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${identity.deviceToken}`,
        },
      });
      if (!res.ok) {
        cache = null;
        return null;
      }
      const body = await res.json() as {
        data?: { accessToken?: string; expiresIn?: number };
      };
      const accessToken = body.data?.accessToken;
      const expiresIn   = body.data?.expiresIn ?? (15 * 60); // default 15m
      if (!accessToken) {
        cache = null;
        return null;
      }
      cache = {
        token: accessToken,
        expiresAt: Date.now() + expiresIn * 1000,
      };
      return accessToken;
    } catch {
      cache = null;
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Return a valid device JWT, minting a new one if the cache is empty
 * or nearing expiry. Returns null if the device isn't paired or the
 * exchange fails (caller should fall back to device token or surface
 * "not paired").
 */
export async function getDeviceJwt(): Promise<string | null> {
  const now = Date.now();
  if (cache && cache.expiresAt - now > REFRESH_SKEW_SECONDS * 1000) {
    return cache.token;
  }
  return refreshDeviceJwt();
}

/** Called when a device is unpaired so the next caller doesn't see a
 *  stale JWT for the previous device. */
export function clearDeviceJwt(): void {
  cache = null;
  inflight = null;
}
