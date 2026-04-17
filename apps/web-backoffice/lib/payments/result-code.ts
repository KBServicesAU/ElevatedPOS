/**
 * SIX TIM API — ResultCode translation
 *
 * The SDK exposes a `ResultCode` enum whose entries become either numeric
 * integer IDs or named constants depending on the SDK build. ANZ Worldline
 * validators expect the POS to surface a human-readable cause for any
 * declined / failed transaction, plus classify the failure into one of the
 * `PaymentErrorCategory` buckets so we can branch on it programmatically.
 *
 * Reference:
 *   https://six-tim.github.io/timapi/doc/js/guide.html (ResultCode section)
 *   https://six-tim.github.io/timapi/doc/js/doc/index.html (ResultCode class)
 *   ANZ Validation Template §3.6 / §3.9 / §3.11
 *
 * Strategy:
 *   Accept either a numeric code, a string name (e.g. "userCancel"), or an
 *   enum-like object (`{ name, value }`). We normalise to a string key, then
 *   look up a translation. If the key is unknown we fall back to the raw
 *   code + the SDK's own exception message.
 */

import type { PaymentErrorCategory } from './domain';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TranslatedResultCode {
  /** Upstream raw code string (e.g. "userCancel" or "552"). */
  code:     string;
  /** Coarse-grained category for branching in state-machine/UI. */
  category: PaymentErrorCategory;
  /**
   * Human-readable explanation suitable for display to the operator.
   * Short, present-tense, and phrased as "what happened", not "what to do".
   */
  message:  string;
  /**
   * When true, retrying the exact same operation may succeed. UI can show a
   * "Try again" affordance. Callers still apply business rules (e.g. never
   * auto-retry after unknown_outcome).
   */
  retryable: boolean;
}

// ─── Translation table ────────────────────────────────────────────────────────
//
// Keys are lower-cased for case-insensitive match. Values follow the SIX TIM
// ResultCode enum names (camelCase). Numeric IDs are included where the SDK
// emits numbers (observed 552 for user cancel on older builds).

interface TableEntry {
  category:  PaymentErrorCategory;
  message:   string;
  retryable: boolean;
}

const TABLE: Record<string, TableEntry> = {
  // ── Success ────────────────────────────────────────────────────────────────
  ok:                    { category: 'customer_decline', message: 'OK',                                 retryable: false },
  '0':                   { category: 'customer_decline', message: 'OK',                                 retryable: false },

  // ── Customer/operator cancel ───────────────────────────────────────────────
  usercancel:            { category: 'customer_cancel',  message: 'Customer cancelled on terminal',      retryable: true  },
  cancel:                { category: 'customer_cancel',  message: 'Transaction cancelled',               retryable: true  },
  cancelled:             { category: 'customer_cancel',  message: 'Transaction cancelled',               retryable: true  },
  aborted:               { category: 'operator_cancel',  message: 'Operator aborted the transaction',    retryable: true  },
  apiaborted:            { category: 'operator_cancel',  message: 'Operator aborted (ECR cancel)',       retryable: true  },
  '552':                 { category: 'customer_cancel',  message: 'Customer cancelled on terminal',      retryable: true  },

  // ── Terminal / communication ───────────────────────────────────────────────
  commnoconnection:      { category: 'network',          message: 'Terminal is unreachable',             retryable: true  },
  commnoresponse:        { category: 'network',          message: 'Terminal did not respond',            retryable: true  },
  timeout:               { category: 'network',          message: 'Terminal timed out',                  retryable: true  },
  connectionlost:        { category: 'network',          message: 'Connection to terminal lost',         retryable: true  },
  deactivated:           { category: 'configuration',    message: 'Terminal is deactivated',             retryable: false },
  notloggedin:           { category: 'configuration',    message: 'Terminal is not logged in',           retryable: true  },
  busy:                  { category: 'terminal_busy',    message: 'Terminal is busy with another task',  retryable: true  },
  '810':                 { category: 'network',          message: 'Terminal timed out',                  retryable: true  },
  '820':                 { category: 'network',          message: 'Terminal is not connected',           retryable: true  },

  // ── Provisioning / configuration ───────────────────────────────────────────
  notinitialized:        { category: 'configuration',    message: 'Terminal is not initialised',         retryable: false },
  configurationerror:    { category: 'configuration',    message: 'Terminal configuration error',        retryable: false },
  invalidconfiguration:  { category: 'configuration',    message: 'Terminal configuration is invalid',   retryable: false },
  invalidamount:         { category: 'configuration',    message: 'Transaction amount is invalid',       retryable: false },
  invaliddata:           { category: 'configuration',    message: 'Transaction data is invalid',         retryable: false },
  '800':                 { category: 'configuration',    message: 'Transaction data error',              retryable: false },
  '801':                 { category: 'configuration',    message: 'Transaction amount is invalid',       retryable: false },
  '802':                 { category: 'configuration',    message: 'Terminal is not initialised',         retryable: false },
  '803':                 { category: 'operator_cancel',  message: 'Transaction was aborted',             retryable: true  },

  // ── Card decline (issuer says no) ──────────────────────────────────────────
  declined:              { category: 'customer_decline', message: 'Card issuer declined the transaction', retryable: false },
  rejected:              { category: 'customer_decline', message: 'Transaction rejected by terminal',     retryable: false },
  offlinerejected:       { category: 'customer_decline', message: 'Declined while offline',               retryable: false },
  limitexceeded:         { category: 'customer_decline', message: 'Transaction limit exceeded',           retryable: false },
  insufficientfunds:     { category: 'customer_decline', message: 'Insufficient funds on card',           retryable: false },
  cardexpired:           { category: 'customer_decline', message: 'Card has expired',                     retryable: false },
  cardblocked:           { category: 'customer_decline', message: 'Card is blocked',                      retryable: false },
  invalidcard:           { category: 'customer_decline', message: 'Card is not valid for this terminal',  retryable: false },
  cardremoved:           { category: 'customer_decline', message: 'Card was removed before completion',   retryable: true  },
  chiperror:             { category: 'customer_decline', message: 'Chip read failed — try again',         retryable: true  },
  referralrequired:      { category: 'customer_decline', message: 'Call merchant services (referral)',    retryable: false },
  wrongpin:              { category: 'customer_decline', message: 'Wrong PIN entered',                    retryable: true  },
  pintriesexceeded:      { category: 'customer_decline', message: 'Too many wrong PIN attempts',          retryable: false },

  // ── Internal / unknown ─────────────────────────────────────────────────────
  internalerror:         { category: 'configuration',    message: 'Terminal internal error',              retryable: true  },
  unknownerror:          { category: 'configuration',    message: 'Unknown terminal error',               retryable: true  },
  '1000':                { category: 'configuration',    message: 'TIM API internal error',               retryable: true  },
  commiterror:           { category: 'commit_failure',   message: 'Commit failed on the terminal',        retryable: false },
  commitnotneeded:       { category: 'commit_failure',   message: 'Commit was not expected here',         retryable: false },
  '1017':                { category: 'commit_failure',   message: 'Commit is not required for this op',   retryable: false },

  // ── Not supported ──────────────────────────────────────────────────────────
  notsupported:          { category: 'unsupported_operation', message: 'Operation not supported by this terminal build', retryable: false },
  functionnotsupported:  { category: 'unsupported_operation', message: 'Function not supported by this terminal build', retryable: false },
};

// ─── Public API ───────────────────────────────────────────────────────────────

export type ResultCodeLike =
  | string
  | number
  | { name?: string; value?: number | string }
  | undefined
  | null;

/**
 * Normalise any ResultCode representation to a lower-cased lookup key.
 * Returns undefined if the input is empty.
 */
export function resultCodeKey(code: ResultCodeLike): string | undefined {
  if (code === null || code === undefined) return undefined;
  if (typeof code === 'string') {
    const trimmed = code.trim();
    return trimmed.length > 0 ? trimmed.toLowerCase() : undefined;
  }
  if (typeof code === 'number') return String(code);
  if (typeof code === 'object') {
    if (typeof code.name === 'string' && code.name.trim().length > 0) {
      return code.name.trim().toLowerCase();
    }
    if (code.value !== undefined && code.value !== null) {
      return String(code.value);
    }
  }
  return undefined;
}

/**
 * Translate a SIX TIM ResultCode to a PaymentErrorCategory plus a
 * human-readable message. Falls back to a generic "declined" translation
 * when the code is unknown. The SDK-supplied `fallbackMessage` (usually
 * `event.exception.message`) is preferred over the default text when the
 * code is not in the table.
 */
export function translateResultCode(
  code: ResultCodeLike,
  fallbackMessage?: string,
): TranslatedResultCode {
  const key = resultCodeKey(code);

  if (!key) {
    return {
      code:      '',
      category:  'configuration',
      message:   fallbackMessage?.trim() || 'Terminal reported an error with no code',
      retryable: true,
    };
  }

  const entry = TABLE[key];
  const rawCode =
    typeof code === 'object' && code && typeof code.name === 'string'
      ? code.name
      : String(code);

  if (entry) {
    // When SDK message is richer, prefer it, but keep our category.
    const message =
      fallbackMessage && fallbackMessage.trim().length > 0 && fallbackMessage !== entry.message
        ? `${entry.message} (${fallbackMessage.trim()})`
        : entry.message;

    return {
      code:      rawCode,
      category:  entry.category,
      message,
      retryable: entry.retryable,
    };
  }

  // Unknown code — surface what we have.
  return {
    code:      rawCode,
    category:  'customer_decline',
    message:   fallbackMessage?.trim() || `Declined (${rawCode})`,
    retryable: false,
  };
}

/**
 * Convenience: translate only if we got a non-empty code, otherwise return
 * a pre-built result covering "we don't know why". Used by the state
 * machine when the adapter returned approved=false but no code.
 */
export function translateResultCodeOrUnknown(
  code: ResultCodeLike,
  fallbackMessage?: string,
): TranslatedResultCode {
  return translateResultCode(code, fallbackMessage);
}
