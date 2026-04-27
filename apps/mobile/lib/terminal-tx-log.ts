/**
 * Terminal Transaction Logger — v2.7.48
 * ================================================================
 * Posts a row to the orders service `terminal_transactions` table for
 * every ANZ Worldline TIM API interaction (purchase, refund, reversal,
 * reconcile, logon, logoff). Built for ANZ certification evidence
 * (merchants must be able to download a full log alongside test
 * receipts) and ongoing audit (cardholder dispute resolution).
 *
 * Design decisions
 *   - Fire-and-forget. The user-facing checkout flow MUST NOT fail
 *     because the audit log POST blipped — the cardholder is already
 *     authed and the merchant copy is already printing. We log the
 *     error to console and move on.
 *   - In-memory queue. If the network is down at the time of the
 *     transaction, the row is buffered and retried on the next call.
 *     Bounded so a long offline stretch doesn't OOM the device.
 *   - Uses `getDeviceJwt()` so the device-paired POS can authenticate
 *     without an employee PIN (kiosk path).
 */

import { getDeviceJwt } from './device-jwt';
import { useDeviceStore } from '../store/device';

const BASE_URL =
  process.env['EXPO_PUBLIC_ORDERS_API_URL'] ??
  process.env['EXPO_PUBLIC_API_URL'] ??
  '';

const MAX_QUEUE = 200;

export type TerminalTxOutcome =
  | 'approved'
  | 'declined'
  | 'cancelled'
  | 'error'
  | 'timeout';

export type TerminalTxType =
  | 'purchase'
  | 'refund'
  | 'reversal'
  | 'reconcile'
  | 'logon'
  | 'logoff';

export interface TerminalTxLogInput {
  outcome: TerminalTxOutcome;
  transactionType: TerminalTxType;
  amountCents?: number | null;
  referenceId?: string | null;
  orderId?: string | null;
  // Approved-side
  transactionRef?: string | null;
  authCode?: string | null;
  rrn?: string | null;
  maskedPan?: string | null;
  cardType?: string | null;
  // Failure-side
  errorCategory?: string | null;
  errorCode?: number | null;
  errorMessage?: string | null;
  errorStep?: string | null;
  // Receipts
  merchantReceipt?: string | null;
  customerReceipt?: string | null;
  // Diagnostic
  durationMs?: number | null;
  timCapabilities?: unknown;
  raw?: unknown;
}

interface QueuedRow {
  body: Record<string, unknown>;
  attempts: number;
}

const queue: QueuedRow[] = [];
let flushing = false;

function buildRow(input: TerminalTxLogInput): Record<string, unknown> | null {
  const identity = useDeviceStore.getState().identity;
  if (!identity) return null;
  const activeLocationId = useDeviceStore.getState().activeLocationId ?? identity.locationId;
  return {
    orgId: identity.orgId,
    locationId: activeLocationId ?? null,
    deviceId: identity.deviceId,
    orderId: input.orderId ?? null,
    referenceId: input.referenceId ?? null,
    provider: 'anz',
    outcome: input.outcome,
    amountCents: input.amountCents ?? null,
    transactionType: input.transactionType,
    transactionRef: input.transactionRef ?? null,
    authCode: input.authCode ?? null,
    rrn: input.rrn ?? null,
    maskedPan: input.maskedPan ?? null,
    cardType: input.cardType ?? null,
    errorCategory: input.errorCategory ?? null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    errorStep: input.errorStep ?? null,
    merchantReceipt: input.merchantReceipt ?? null,
    customerReceipt: input.customerReceipt ?? null,
    durationMs: input.durationMs ?? null,
    timCapabilities: input.timCapabilities ?? null,
    raw: input.raw ?? null,
  };
}

async function flushOnce(): Promise<void> {
  if (flushing) return;
  if (queue.length === 0) return;
  if (!BASE_URL) return;
  flushing = true;
  try {
    const jwt = await getDeviceJwt();
    if (!jwt) return; // not paired or token mint failed; try later
    while (queue.length > 0) {
      const head = queue[0];
      if (!head) break;
      try {
        const res = await fetch(`${BASE_URL}/api/v1/terminal/transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify(head.body),
        });
        if (res.ok) {
          queue.shift();
          continue;
        }
        // 4xx — likely a malformed payload; drop so we don't loop on it.
        if (res.status >= 400 && res.status < 500) {
          console.warn('[terminal-tx-log] dropping row after 4xx', res.status);
          queue.shift();
          continue;
        }
        // 5xx / network — back off and try later.
        head.attempts += 1;
        if (head.attempts >= 5) {
          console.warn('[terminal-tx-log] dropping row after 5 attempts');
          queue.shift();
          continue;
        }
        break;
      } catch (err) {
        // Network blip — leave the row in the queue and try on the next
        // call. Don't loop here or we'll burn CPU on a flat connection.
        console.warn('[terminal-tx-log] post failed, will retry', err);
        head.attempts += 1;
        if (head.attempts >= 5) queue.shift();
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

/**
 * Capture an ANZ terminal interaction. Never throws — failures only
 * surface as a console warning so checkout flows never break on logging.
 */
export function logTerminalTx(input: TerminalTxLogInput): void {
  try {
    const body = buildRow(input);
    if (!body) {
      // Device not paired — nowhere to attribute the row. Log to console
      // so the operator can see something happened during cert testing.
      console.warn('[terminal-tx-log] device not paired; tx not logged', {
        outcome: input.outcome,
        type: input.transactionType,
      });
      return;
    }
    if (queue.length >= MAX_QUEUE) {
      // Drop the oldest entry to keep the queue bounded. With a 200-row
      // cap and one row per terminal interaction, this only kicks in
      // after ~200 offline transactions on the same device.
      queue.shift();
    }
    queue.push({ body, attempts: 0 });
    void flushOnce();
  } catch (err) {
    console.warn('[terminal-tx-log] capture failed', err);
  }
}

/** Test hook — drain the queue. */
export async function __flushTerminalTxLog(): Promise<void> {
  await flushOnce();
}
