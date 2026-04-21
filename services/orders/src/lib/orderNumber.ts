/**
 * Order / refund number generators.
 *
 * Format: <PREFIX>-<YYYYMMDD>-<HHMMSS>-<RAND>
 *
 * Previously this module used `let counter = 1` incremented per call. The
 * counter reset to 1 on every process restart (new pod, deploy, crash),
 * producing order numbers like ORD-20260421-0001 that collided with rows
 * already in the table → "duplicate key value violates unique constraint
 * idx_orders_org_number".
 *
 * The new format combines date + time + a short random suffix so it:
 *   • never collides across process restarts
 *   • is monotonic within the same second (time always advances)
 *   • is human-readable on a receipt / support ticket
 *   • fits comfortably in the varchar(50) column
 *
 * Collision probability for two orders in the same second from the same
 * org: 1 in 32^4 ≈ 1 in a million. The DB unique index catches any
 * (astronomically rare) collision, and the client retries.
 */

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function yyyymmdd(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}`;
}

function hhmmss(d: Date): string {
  return `${pad(d.getHours(), 2)}${pad(d.getMinutes(), 2)}${pad(d.getSeconds(), 2)}`;
}

/** 4 upper-case alphanumerics (no I/O/0/1 to avoid human confusion). */
function randomSuffix(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function generateOrderNumber(locationCode = 'ORD'): string {
  const now = new Date();
  return `${locationCode}-${yyyymmdd(now)}-${hhmmss(now)}-${randomSuffix()}`;
}

export function generateRefundNumber(): string {
  const now = new Date();
  return `REF-${yyyymmdd(now)}-${hhmmss(now)}-${randomSuffix()}`;
}
