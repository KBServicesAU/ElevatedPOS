/**
 * One-time backfill: Postgres orders → ClickHouse sales_fact + order_lines_fact.
 *
 * Orders placed before v2.7.28 (when services/reporting's Kafka consumer was
 * wired) never landed in ClickHouse. This script reads historical orders from
 * the orders service's Postgres DB and ingests them directly into ClickHouse,
 * using the same mapping shape as `services/reporting/src/ingest.ts`.
 *
 * Run from the reporting service's workspace (so `pg` and `@clickhouse/client`
 * resolve):
 *
 *   pnpm -C services/reporting tsx ../../scripts/backfill-sales-fact.ts [options]
 *
 * Options:
 *   --before=YYYY-MM-DD  Only backfill orders with completed_at/created_at
 *                        strictly before this date. Omit to backfill all.
 *   --org=<uuid>         Restrict backfill to a single orgId.
 *   --batch=<n>          ClickHouse batch size (default 1000).
 *   --dry-run            Log what would happen; don't insert anything.
 *
 * Env vars:
 *   DATABASE_URL (or ORDERS_DATABASE_URL) — orders Postgres
 *   CLICKHOUSE_URL / CLICKHOUSE_HOST / CLICKHOUSE_PORT / CLICKHOUSE_USER /
 *   CLICKHOUSE_PASSWORD / CLICKHOUSE_DB — analytics ClickHouse
 *
 * Idempotency: the script queries ClickHouse up-front for order_ids already
 * present in sales_fact and skips any candidate that's already there. The
 * existing tables use plain MergeTree (not ReplacingMergeTree), so deduping
 * happens at the application layer. Safe to re-run after a partial failure.
 */

import { Pool } from 'pg';
import { clickhouse } from '../services/reporting/src/clickhouse.js';

// ──────────────────────────────────────────────────────────────────────────────
// CLI args

type Args = {
  before: string | null;
  org: string | null;
  batch: number;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { before: null, org: null, batch: 1000, dryRun: false };
  for (const a of argv) {
    if (a.startsWith('--before=')) out.before = a.slice('--before='.length);
    else if (a.startsWith('--org=')) out.org = a.slice('--org='.length);
    else if (a.startsWith('--batch=')) out.batch = Math.max(1, Number(a.slice('--batch='.length)));
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: backfill-sales-fact.ts [--before=YYYY-MM-DD] [--org=<uuid>] [--batch=1000] [--dry-run]',
      );
      process.exit(0);
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// Types matching services/reporting/src/ingest.ts shape

type SalesFactRow = {
  order_id: string;
  org_id: string;
  location_id: string;
  channel: string;
  order_type: string;
  customer_id: string | null;
  employee_id: string | null;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  completed_at: Date;
  created_at: Date;
  year: number;
  month: number;
  day_of_week: number;
  hour: number;
};

type OrderLineFactRow = {
  line_id: string;
  order_id: string;
  org_id: string;
  location_id: string;
  product_id: string;
  product_name: string;
  category_id: string | null;
  quantity: number;
  unit_price: number;
  cost_price: number;
  line_total: number;
  discount_amount: number;
  completed_at: Date;
};

// Raw row joined from orders + order_lines. One row per (order, line).
type JoinedRow = {
  order_id: string;
  org_id: string;
  location_id: string;
  channel: string;
  order_type: string;
  status: string;
  customer_id: string | null;
  employee_id: string | null;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  total: string;
  completed_at: Date | null;
  created_at: Date;
  line_id: string | null;
  product_id: string | null;
  product_name: string | null;
  line_quantity: string | null;
  line_unit_price: string | null;
  line_cost_price: string | null;
  line_total_amount: string | null;
  line_discount_amount: string | null;
};

// ──────────────────────────────────────────────────────────────────────────────

function toSalesFact(o: {
  orderId: string;
  orgId: string;
  locationId: string;
  channel: string;
  orderType: string;
  customerId: string | null;
  employeeId: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  completedAt: Date;
  createdAt: Date;
}): SalesFactRow {
  return {
    order_id: o.orderId,
    org_id: o.orgId,
    location_id: o.locationId,
    channel: o.channel,
    order_type: o.orderType,
    customer_id: o.customerId,
    employee_id: o.employeeId,
    subtotal: o.subtotal,
    discount_total: o.discountTotal,
    tax_total: o.taxTotal,
    total: o.total,
    completed_at: o.completedAt,
    created_at: o.createdAt,
    year: o.completedAt.getFullYear(),
    month: o.completedAt.getMonth() + 1,
    day_of_week: o.completedAt.getDay(),
    hour: o.completedAt.getHours(),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// ClickHouse helpers

/**
 * Return the subset of `candidates` that already have a row in sales_fact.
 * Splits into chunks so the IN (...) list stays under ClickHouse's parameter
 * limits.
 */
async function findExistingOrderIds(candidates: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  if (candidates.length === 0) return existing;

  const CHUNK = 5000;
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const slice = candidates.slice(i, i + CHUNK);
    const quoted = slice.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
    const rs = await clickhouse.query({
      query: `SELECT order_id FROM elevatedpos_analytics.sales_fact WHERE order_id IN (${quoted})`,
      format: 'JSONEachRow',
    });
    const rows = (await rs.json()) as Array<{ order_id: string }>;
    for (const r of rows) existing.add(r.order_id);
  }
  return existing;
}

async function insertSalesFactBatch(rows: SalesFactRow[], dryRun: boolean): Promise<void> {
  if (rows.length === 0) return;
  if (dryRun) {
    console.log(`[dry-run] would insert ${rows.length} rows into sales_fact`);
    return;
  }
  await clickhouse.insert({
    table: 'elevatedpos_analytics.sales_fact',
    values: rows,
    format: 'JSONEachRow',
  });
}

async function insertOrderLinesBatch(rows: OrderLineFactRow[], dryRun: boolean): Promise<void> {
  if (rows.length === 0) return;
  if (dryRun) {
    console.log(`[dry-run] would insert ${rows.length} rows into order_lines_fact`);
    return;
  }
  await clickhouse.insert({
    table: 'elevatedpos_analytics.order_lines_fact',
    values: rows,
    format: 'JSONEachRow',
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Main

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const connectionString = process.env['DATABASE_URL'] ?? process.env['ORDERS_DATABASE_URL'];
  if (!connectionString) {
    console.error('DATABASE_URL (or ORDERS_DATABASE_URL) is required');
    process.exit(1);
  }

  console.log('[backfill] starting with args:', {
    before: args.before ?? '(none)',
    org: args.org ?? '(all)',
    batch: args.batch,
    dryRun: args.dryRun,
  });

  const pool = new Pool({
    connectionString,
    ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  // Completed orders' completed_at is non-null by convention. We also catch
  // refunded/partially_refunded orders: those started from a 'completed' state
  // and should still appear in sales totals. For the cutoff we use completed_at
  // when available, falling back to created_at for safety.
  const clauses: string[] = [
    `o.status IN ('completed','refunded','partially_refunded')`,
  ];
  const params: Array<string | Date> = [];

  if (args.before) {
    const cutoff = new Date(args.before);
    if (Number.isNaN(cutoff.getTime())) {
      console.error(`Invalid --before date: ${args.before}`);
      process.exit(1);
    }
    params.push(cutoff);
    clauses.push(`COALESCE(o.completed_at, o.created_at) < $${params.length}`);
  }
  if (args.org) {
    params.push(args.org);
    clauses.push(`o.org_id = $${params.length}`);
  }

  const where = clauses.join(' AND ');
  const sql = `
    SELECT
      o.id                    AS order_id,
      o.org_id                AS org_id,
      o.location_id           AS location_id,
      o.channel               AS channel,
      o.order_type            AS order_type,
      o.status                AS status,
      o.customer_id           AS customer_id,
      o.employee_id           AS employee_id,
      o.subtotal              AS subtotal,
      o.discount_total        AS discount_total,
      o.tax_total             AS tax_total,
      o.total                 AS total,
      o.completed_at          AS completed_at,
      o.created_at            AS created_at,
      ol.id                   AS line_id,
      ol.product_id           AS product_id,
      ol.name                 AS product_name,
      ol.quantity             AS line_quantity,
      ol.unit_price           AS line_unit_price,
      ol.cost_price           AS line_cost_price,
      ol.line_total           AS line_total_amount,
      ol.discount_amount      AS line_discount_amount
    FROM orders o
    LEFT JOIN order_lines ol ON ol.order_id = o.id
    WHERE ${where}
    ORDER BY o.id, ol.id
  `;

  console.log('[backfill] querying Postgres...');
  const pgRes = await pool.query<JoinedRow>(sql, params);
  console.log(`[backfill] fetched ${pgRes.rowCount ?? 0} joined rows from Postgres`);

  // Group by order_id — one order may have many lines (or none).
  type Grouped = {
    order: Omit<JoinedRow, 'line_id' | 'product_id' | 'product_name' | 'line_quantity' | 'line_unit_price' | 'line_cost_price' | 'line_total_amount' | 'line_discount_amount'>;
    lines: Array<Pick<JoinedRow, 'line_id' | 'product_id' | 'product_name' | 'line_quantity' | 'line_unit_price' | 'line_cost_price' | 'line_total_amount' | 'line_discount_amount'>>;
  };
  const grouped = new Map<string, Grouped>();
  for (const r of pgRes.rows) {
    let g = grouped.get(r.order_id);
    if (!g) {
      g = {
        order: {
          order_id: r.order_id,
          org_id: r.org_id,
          location_id: r.location_id,
          channel: r.channel,
          order_type: r.order_type,
          status: r.status,
          customer_id: r.customer_id,
          employee_id: r.employee_id,
          subtotal: r.subtotal,
          discount_total: r.discount_total,
          tax_total: r.tax_total,
          total: r.total,
          completed_at: r.completed_at,
          created_at: r.created_at,
        },
        lines: [],
      };
      grouped.set(r.order_id, g);
    }
    if (r.line_id && r.product_id) {
      g.lines.push({
        line_id: r.line_id,
        product_id: r.product_id,
        product_name: r.product_name,
        line_quantity: r.line_quantity,
        line_unit_price: r.line_unit_price,
        line_cost_price: r.line_cost_price,
        line_total_amount: r.line_total_amount,
        line_discount_amount: r.line_discount_amount,
      });
    }
  }

  const allOrderIds = Array.from(grouped.keys());
  console.log(`[backfill] grouped into ${allOrderIds.length} distinct orders`);

  console.log('[backfill] checking ClickHouse for already-ingested orders...');
  const alreadyIn = await findExistingOrderIds(allOrderIds);
  const toInsertIds = allOrderIds.filter((id) => !alreadyIn.has(id));
  console.log(
    `[backfill] ${alreadyIn.size} already in ClickHouse, ${toInsertIds.length} new to insert`,
  );

  let processed = 0;
  let salesInserted = 0;
  let linesInserted = 0;
  let skipped = 0;

  let salesBuf: SalesFactRow[] = [];
  let linesBuf: OrderLineFactRow[] = [];

  async function flush(): Promise<void> {
    if (salesBuf.length > 0) {
      await insertSalesFactBatch(salesBuf, args.dryRun);
      salesInserted += salesBuf.length;
      salesBuf = [];
    }
    if (linesBuf.length > 0) {
      await insertOrderLinesBatch(linesBuf, args.dryRun);
      linesInserted += linesBuf.length;
      linesBuf = [];
    }
  }

  for (const orderId of toInsertIds) {
    const g = grouped.get(orderId)!;
    const o = g.order;

    // Use completed_at if present, else fall back to created_at. Mirrors the
    // reporting consumer's fallback for envelopes that lack a completedAt.
    const completedAt = o.completed_at ?? o.created_at;
    if (!completedAt) {
      skipped += 1;
      continue;
    }

    const salesRow = toSalesFact({
      orderId: o.order_id,
      orgId: o.org_id,
      locationId: o.location_id,
      channel: o.channel,
      orderType: o.order_type,
      customerId: o.customer_id,
      employeeId: o.employee_id,
      subtotal: Number(o.subtotal),
      discountTotal: Number(o.discount_total),
      taxTotal: Number(o.tax_total),
      total: Number(o.total),
      completedAt: new Date(completedAt),
      createdAt: new Date(o.created_at),
    });
    salesBuf.push(salesRow);

    for (const l of g.lines) {
      if (!l.line_id || !l.product_id) continue;
      linesBuf.push({
        line_id: l.line_id,
        order_id: o.order_id,
        org_id: o.org_id,
        location_id: o.location_id,
        product_id: l.product_id,
        product_name: l.product_name ?? '',
        category_id: null,
        quantity: Number(l.line_quantity ?? 0),
        unit_price: Number(l.line_unit_price ?? 0),
        cost_price: Number(l.line_cost_price ?? 0),
        line_total: Number(l.line_total_amount ?? 0),
        discount_amount: Number(l.line_discount_amount ?? 0),
        completed_at: new Date(completedAt),
      });
    }

    processed += 1;

    if (salesBuf.length >= args.batch || linesBuf.length >= args.batch) {
      await flush();
      console.log(
        `[backfill] Processed ${processed} orders, inserted ${salesInserted} sales_fact rows (${linesInserted} order_lines_fact rows)`,
      );
    }
  }

  await flush();

  console.log('[backfill] done.');
  console.log(
    `[backfill] Processed ${processed} orders, inserted ${salesInserted} sales_fact rows (${linesInserted} order_lines_fact rows). Skipped ${skipped} (missing completed_at). Deduped ${alreadyIn.size} pre-existing.`,
  );

  await pool.end();
  await clickhouse.close();
}

main().catch(async (err) => {
  console.error('[backfill] FAILED:', err);
  try { await clickhouse.close(); } catch { /* ignore */ }
  process.exit(1);
});
