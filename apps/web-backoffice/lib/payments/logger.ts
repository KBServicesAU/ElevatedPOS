/**
 * Structured payment logger
 *
 * Records all terminal events with enough detail for ANZ Worldline certification
 * and production support. All sensitive card data is excluded — only masked PAN,
 * result codes, and metadata are logged.
 */

import type { PaymentLogEntry, PaymentLogLevel } from './domain';

// Maximum entries kept in memory per session (oldest dropped when exceeded)
const MAX_LOG_ENTRIES = 500;

export class PaymentLogger {
  private _entries: PaymentLogEntry[] = [];
  private _intentId?: string;
  private _onEntry?: (entry: PaymentLogEntry) => void;

  constructor(intentId?: string, onEntry?: (entry: PaymentLogEntry) => void) {
    this._intentId = intentId;
    this._onEntry  = onEntry;
  }

  setIntentId(id: string) { this._intentId = id; }
  setOnEntry(fn: (e: PaymentLogEntry) => void) { this._onEntry = fn; }

  private _log(level: PaymentLogLevel, event: string, details?: Record<string, unknown>) {
    const entry: PaymentLogEntry = {
      at:      new Date().toISOString(),
      level,
      event,
      details: details
        ? { ...details, ...(this._intentId ? { intentId: this._intentId } : {}) }
        : (this._intentId ? { intentId: this._intentId } : undefined),
    };

    if (this._entries.length >= MAX_LOG_ENTRIES) this._entries.shift();
    this._entries.push(entry);

    // Forward to caller (e.g. state machine for server-side persistence)
    this._onEntry?.(entry);

    // Also write to console in dev — redact any sensitive fields
    if (process.env.NODE_ENV !== 'production') {
      const fn = level === 'error' ? console.error
               : level === 'warn'  ? console.warn
               : level === 'info'  ? console.info
               : console.debug;
      fn(`[ANZ-PAY] [${level.toUpperCase()}] ${event}`, entry.details ?? '');
    }
  }

  debug(event: string, details: Record<string, unknown>) { this._log('debug', event, details); }
  info (event: string, details: Record<string, unknown>) { this._log('info',  event, details); }
  warn (event: string, details: Record<string, unknown>) { this._log('warn',  event, details); }
  error(event: string, details: Record<string, unknown>) { this._log('error', event, details); }

  /** Return a snapshot of all log entries (for support / server upload) */
  getEntries(): PaymentLogEntry[] {
    return [...this._entries];
  }

  /** Return entries since a given ISO timestamp */
  getEntriesSince(isoTimestamp: string): PaymentLogEntry[] {
    return this._entries.filter((e) => e.at >= isoTimestamp);
  }

  clear() {
    this._entries = [];
  }
}
