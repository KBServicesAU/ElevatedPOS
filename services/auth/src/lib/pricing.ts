/**
 * Per-device pricing config for ElevatedPOS.
 *
 * v2.7.51 — replaces the legacy 3-plan model (starter/professional/enterprise)
 * with per-device monthly pricing. Each merchant declares # locations and
 * # devices per type per location at signup, and is charged the sum
 * monthly.
 *
 * Prices are AUD/month. Override via env if needed (DEVICE_PRICE_POS, etc.).
 */
export type DeviceType = 'pos' | 'kds' | 'kiosk' | 'signage';

/** Display prices in dollars (whole AUD) — used for the live UI total. */
export const DEVICE_PRICE_AUD: Record<DeviceType, number> = {
  pos:     parseInt(process.env['DEVICE_PRICE_POS']     ?? '49', 10),
  kds:     parseInt(process.env['DEVICE_PRICE_KDS']     ?? '29', 10),
  kiosk:   parseInt(process.env['DEVICE_PRICE_KIOSK']   ?? '39', 10),
  signage: parseInt(process.env['DEVICE_PRICE_SIGNAGE'] ?? '19', 10),
};

/** Same prices in cents — used for Stripe + DB. */
export const DEVICE_PRICE_CENTS: Record<DeviceType, number> = {
  pos:     DEVICE_PRICE_AUD.pos     * 100,
  kds:     DEVICE_PRICE_AUD.kds     * 100,
  kiosk:   DEVICE_PRICE_AUD.kiosk   * 100,
  signage: DEVICE_PRICE_AUD.signage * 100,
};

export interface LocationDevices {
  /** Optional human-readable label for UI / receipts. */
  name?: string;
  pos:     number;
  kds:     number;
  kiosk:   number;
  signage: number;
}

export interface PerDevicePricing {
  locations: LocationDevices[];
}

/**
 * Total devices across every location and type — used for the
 * "{N} devices × $X/device/month = $Y/month" UI label.
 */
export function totalDeviceCount(p: PerDevicePricing): number {
  return p.locations.reduce(
    (n, l) => n + l.pos + l.kds + l.kiosk + l.signage,
    0,
  );
}

/** Monthly total in cents. */
export function monthlyTotalCents(p: PerDevicePricing): number {
  return p.locations.reduce((sum, l) =>
    sum +
    l.pos     * DEVICE_PRICE_CENTS.pos +
    l.kds     * DEVICE_PRICE_CENTS.kds +
    l.kiosk   * DEVICE_PRICE_CENTS.kiosk +
    l.signage * DEVICE_PRICE_CENTS.signage,
    0,
  );
}

/** Monthly total in dollars (for UI). */
export function monthlyTotalDollars(p: PerDevicePricing): number {
  return monthlyTotalCents(p) / 100;
}
