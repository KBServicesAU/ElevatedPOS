/**
 * ANZ TIM API log sink — IndexedDB-backed buffer for §4 submission.
 *
 * ANZ Validation Template §4 "Submission Checklist" mandates TIM API log files
 * named TimApiYYYYMMDD.log with logging set to ALL / FINEST. This module is
 * the browser-side capture point for every log record the SDK emits through
 * window.onTimApiPublishLogRecord.
 *
 * Design:
 *  - In-memory ring buffer of up to MAX_ENTRIES records for fast download
 *  - Persisted to IndexedDB so logs survive page reloads (important during
 *    validation when testers reload the POS between checklist steps)
 *  - Downloaded as a plain-text file in the TimApi format the bank expects
 *
 * The sink is a singleton accessed via getAnzLogSink(). First call
 * initialises the IDB connection lazily; the SDK can start publishing logs
 * immediately while IDB is still opening (appends are queued).
 */

const DB_NAME   = 'ElevatedPOS-TimApiLogs';
const STORE     = 'records';
const DB_VER    = 1;
const MAX_ENTRIES = 5_000;

export interface AnzLogRecord {
  /** ISO timestamp — either from the SDK record or captured at append time. */
  at: string;
  /** FINEST / FINE / INFO / WARNING / SEVERE per java.util.logging convention */
  level: string;
  /** Logger source (e.g. timapi.Terminal, timapi.Connection) */
  logger: string;
  /** Plain-text message */
  message: string;
  /** Optional thrown throwable stack */
  thrown?: string;
}

/**
 * Normalise an arbitrary SDK log record into the shape we persist. The SDK
 * publishes records that roughly match java.util.logging.LogRecord; we
 * defensive-decode the known fields and fall back to toString() when needed.
 */
function normalize(raw: unknown): AnzLogRecord {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (raw ?? {}) as any;

  const at =
    (typeof r.at      === 'string'                         ? r.at
     : typeof r.millis === 'number'                        ? new Date(r.millis).toISOString()
     : r.date instanceof Date                              ? r.date.toISOString()
     :                                                       new Date().toISOString());

  const level =
    (typeof r.level   === 'string'                         ? r.level
     : typeof r.levelName === 'string'                     ? r.levelName
     : r.level?.name ?? 'INFO');

  const logger =
    (typeof r.logger      === 'string'                     ? r.logger
     : typeof r.loggerName === 'string'                    ? r.loggerName
     : r.sourceClassName ?? 'timapi');

  let message: string;
  if (typeof r.message === 'string') message = r.message;
  else if (r.message != null)        message = String(r.message);
  else                                message = JSON.stringify(r).slice(0, 2_000);

  let thrown: string | undefined;
  if (r.thrown) {
    try {
      thrown = r.thrown.stack ?? r.thrown.message ?? String(r.thrown);
    } catch { /* ignore */ }
  }

  return { at, level, logger, message, thrown };
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true });
        store.createIndex('at',     'at',     { unique: false });
        store.createIndex('ymd',    'ymd',    { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error ?? new Error('IDB open failed'));
  });
}

// ─── Sink implementation ──────────────────────────────────────────────────────

class AnzLogSink {
  private _buffer: AnzLogRecord[] = [];
  private _dbPromise: Promise<IDBDatabase> | null = null;
  private _queue: AnzLogRecord[] = [];
  private _flushing = false;

  constructor() {
    // Lazily open the DB so SSR does not fail.
    if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
      this._dbPromise = openDb().catch(() => {
        // IDB refused (e.g. Safari private mode) — fall back to in-memory only.
        this._dbPromise = null;
        return Promise.reject(new Error('IDB open failed — logs kept in memory only'));
      });
    }
  }

  /**
   * Append a raw SDK record (called from window.onTimApiPublishLogRecord).
   * Safe to call synchronously from any SDK callback — never throws.
   */
  append(raw: unknown): void {
    try {
      const rec = normalize(raw);
      if (this._buffer.length >= MAX_ENTRIES) this._buffer.shift();
      this._buffer.push(rec);
      this._queue.push(rec);
      void this._flushQueue();
    } catch { /* non-fatal */ }
  }

  /** Return all in-memory records (fast path for immediate download). */
  getEntries(): AnzLogRecord[] {
    return [...this._buffer];
  }

  /** Count of in-memory records (for UI display). */
  get size(): number { return this._buffer.length; }

  /**
   * Download the current buffer as TimApiYYYYMMDD.log per §4 submission.
   * If `persisted=true` the file also includes records from IDB (older days).
   */
  async download(opts: { persisted?: boolean } = {}): Promise<void> {
    if (typeof window === 'undefined') return;

    let records: AnzLogRecord[] = this._buffer;
    if (opts.persisted && this._dbPromise) {
      try {
        records = await this._readAll();
      } catch { /* fall through with in-memory only */ }
    }

    const text = records.map(formatRecord).join('\n') + '\n';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `TimApi${yyyymmdd()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Clear both in-memory and persisted records (use with care). */
  async clear(): Promise<void> {
    this._buffer = [];
    this._queue  = [];
    if (!this._dbPromise) return;
    try {
      const db = await this._dbPromise;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror    = () => reject(tx.error);
      });
    } catch { /* non-fatal */ }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async _flushQueue(): Promise<void> {
    if (this._flushing || !this._dbPromise) return;
    this._flushing = true;
    try {
      const db = await this._dbPromise;
      const batch = this._queue.splice(0);
      if (!batch.length) return;

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        for (const rec of batch) {
          // Add a YYYYMMDD field so we can group/prune by day later.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row: any = { ...rec, ymd: rec.at.slice(0, 10).replace(/-/g, '') };
          try { store.add(row); } catch { /* ignore individual failures */ }
        }
        tx.oncomplete = () => resolve();
        tx.onerror    = () => reject(tx.error);
      });
    } catch { /* non-fatal */ } finally {
      this._flushing = false;
      if (this._queue.length > 0) void this._flushQueue();
    }
  }

  private async _readAll(): Promise<AnzLogRecord[]> {
    if (!this._dbPromise) return this._buffer;
    const db = await this._dbPromise;
    return new Promise<AnzLogRecord[]>((resolve, reject) => {
      const out: AnzLogRecord[] = [];
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { at, level, logger, message, thrown } = cursor.value as any;
          out.push({ at, level, logger, message, thrown });
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Format a single record in the text form ANZ validation reviewers expect. */
function formatRecord(rec: AnzLogRecord): string {
  const thrown = rec.thrown ? `\n${rec.thrown}` : '';
  return `${rec.at} [${rec.level.padEnd(7)}] ${rec.logger} - ${rec.message}${thrown}`;
}

function yyyymmdd(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

// ─── Singleton accessor ───────────────────────────────────────────────────────

let _singleton: AnzLogSink | null = null;

export function getAnzLogSink(): AnzLogSink {
  if (!_singleton) _singleton = new AnzLogSink();
  return _singleton;
}

/** One-liner used by the Settings modal to trigger a TimApi log download. */
export async function downloadTimApiLog(opts: { persisted?: boolean } = { persisted: true }): Promise<void> {
  await getAnzLogSink().download(opts);
}
