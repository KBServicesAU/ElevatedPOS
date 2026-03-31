import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

// On web, expo-sqlite's synchronous API is unavailable.
// All functions become no-ops so the rest of the app renders normally.
const isWeb = Platform.OS === 'web';

type DB = ReturnType<typeof SQLite.openDatabaseSync> | null;
let db: DB = null;

if (!isWeb) {
  db = SQLite.openDatabaseSync('elevatedpos_offline.db');
}

// Initialize tables
export function initOfflineDB() {
  if (isWeb || !db) return;
  db.execSync(`
    CREATE TABLE IF NOT EXISTS pending_sync (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS local_orders (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      synced INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS product_cache (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

// Queue an event for sync
export function queueEvent(eventType: string, payload: unknown) {
  if (isWeb || !db) return;
  db.runSync(
    'INSERT INTO pending_sync (event_type, payload, created_at) VALUES (?, ?, ?)',
    [eventType, JSON.stringify(payload), new Date().toISOString()],
  );
}

// Get all pending events
export function getPendingEvents() {
  if (isWeb || !db) return [];
  return db.getAllSync<{
    id: number;
    event_type: string;
    payload: string;
    retry_count: number;
  }>('SELECT * FROM pending_sync ORDER BY id ASC');
}

// Mark event as synced (delete it)
export function markSynced(id: number) {
  if (isWeb || !db) return;
  db.runSync('DELETE FROM pending_sync WHERE id = ?', [id]);
}

// Mark event as failed
export function markFailed(id: number, error: string) {
  if (isWeb || !db) return;
  db.runSync(
    'UPDATE pending_sync SET retry_count = retry_count + 1, last_error = ? WHERE id = ?',
    [error, id],
  );
}

// Save order locally
export function saveLocalOrder(id: string, data: unknown) {
  if (isWeb || !db) return;
  db.runSync(
    'INSERT OR REPLACE INTO local_orders (id, data, synced, created_at) VALUES (?, ?, 0, ?)',
    [id, JSON.stringify(data), new Date().toISOString()],
  );
}

// Get unsynced orders
export function getUnsyncedOrders() {
  if (isWeb || !db) return [];
  return db.getAllSync<{ id: string; data: string }>(
    'SELECT * FROM local_orders WHERE synced = 0',
  );
}

// Cache products
export function cacheProducts(products: unknown[]) {
  if (isWeb || !db) return;
  db.runSync('DELETE FROM product_cache');
  for (const p of products as Array<{ id: string }>) {
    db.runSync(
      'INSERT INTO product_cache (id, data, updated_at) VALUES (?, ?, ?)',
      [p.id, JSON.stringify(p), new Date().toISOString()],
    );
  }
}

// Get cached products
export function getCachedProducts() {
  if (isWeb || !db) return [];
  const rows = db.getAllSync<{ data: string }>('SELECT data FROM product_cache');
  return rows.map((r) => JSON.parse(r.data) as unknown);
}
