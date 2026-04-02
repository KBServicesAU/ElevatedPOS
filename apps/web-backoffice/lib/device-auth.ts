/**
 * Client-side helpers for device authentication.
 * Device tokens are stored in localStorage under well-known keys.
 * These helpers are safe to import in 'use client' components only.
 */

const DEVICE_TOKEN_KEY = 'nexus_device_token';
const DEVICE_INFO_KEY = 'nexus_device_info';

export interface DeviceInfo {
  deviceId: string;
  role: 'pos' | 'kds' | 'kiosk';
  locationId: string;
  orgId: string;
  label?: string;
  registerId?: string;
}

/** Retrieve the stored device token, or null if not paired. */
export function getDeviceToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(DEVICE_TOKEN_KEY);
}

/** Retrieve the stored device info, or null if not paired. */
export function getDeviceInfo(): DeviceInfo | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(DEVICE_INFO_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DeviceInfo;
  } catch {
    return null;
  }
}

/** Persist a device token and its associated metadata after a successful pair. */
export function setDeviceSession(token: string, info: DeviceInfo): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEVICE_TOKEN_KEY, token);
  localStorage.setItem(DEVICE_INFO_KEY, JSON.stringify(info));
}

/** Clear the device session (e.g. on revoke or factory reset). */
export function clearDeviceSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(DEVICE_TOKEN_KEY);
  localStorage.removeItem(DEVICE_INFO_KEY);
}

/**
 * fetch() wrapper that automatically adds the stored device token as a Bearer
 * Authorization header. Falls back to an unauthenticated request when no token
 * is available (so callers don't have to guard every usage).
 */
export async function fetchWithDeviceAuth(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = getDeviceToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...options, headers });
}
