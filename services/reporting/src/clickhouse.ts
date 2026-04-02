import { createClient } from '@clickhouse/client';

// Build ClickHouse URL from CLICKHOUSE_URL (preferred) or CLICKHOUSE_HOST + CLICKHOUSE_PORT
const clickhouseUrl = process.env['CLICKHOUSE_URL']
  ?? (process.env['CLICKHOUSE_HOST']
    ? `http://${process.env['CLICKHOUSE_HOST']}:${process.env['CLICKHOUSE_PORT'] ?? '8123'}`
    : 'http://localhost:8123');

export const clickhouse = createClient({
  url: clickhouseUrl,
  username: process.env['CLICKHOUSE_USER'] ?? 'default',
  password: process.env['CLICKHOUSE_PASSWORD'] ?? '',
  database: process.env['CLICKHOUSE_DB'] ?? 'nexus_analytics',
});

export async function initClickHouseTables() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS nexus_analytics.sales_fact (
      order_id String,
      org_id String,
      location_id String,
      channel LowCardinality(String),
      order_type LowCardinality(String),
      customer_id Nullable(String),
      employee_id Nullable(String),
      subtotal Decimal(10,2),
      discount_total Decimal(10,2),
      tax_total Decimal(10,2),
      total Decimal(10,2),
      completed_at DateTime,
      created_at DateTime,
      year UInt16,
      month UInt8,
      day_of_week UInt8,
      hour UInt8
    ) ENGINE = MergeTree()
    PARTITION BY (org_id, year, month)
    ORDER BY (org_id, location_id, completed_at)`,

    `CREATE TABLE IF NOT EXISTS nexus_analytics.order_lines_fact (
      line_id String,
      order_id String,
      org_id String,
      location_id String,
      product_id String,
      product_name String,
      category_id Nullable(String),
      quantity Decimal(10,3),
      unit_price Decimal(10,2),
      cost_price Decimal(10,2),
      line_total Decimal(10,2),
      discount_amount Decimal(10,2),
      completed_at DateTime
    ) ENGINE = MergeTree()
    PARTITION BY (org_id, toYYYYMM(completed_at))
    ORDER BY (org_id, product_id, completed_at)`,

    `CREATE TABLE IF NOT EXISTS nexus_analytics.customer_activity (
      event_id String,
      org_id String,
      customer_id String,
      event_type LowCardinality(String),
      amount Nullable(Decimal(10,2)),
      points Nullable(Int32),
      location_id Nullable(String),
      occurred_at DateTime
    ) ENGINE = MergeTree()
    PARTITION BY (org_id, toYYYYMM(occurred_at))
    ORDER BY (org_id, customer_id, occurred_at)`,
  ];

  for (const stmt of statements) {
    try {
      await clickhouse.exec({ query: stmt });
    } catch (e) {
      console.warn('ClickHouse table init failed (non-critical):', e);
    }
  }
}
