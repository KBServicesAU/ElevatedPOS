import { clickhouse } from './clickhouse.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SalesSummary {
  totalRevenue: number;
  totalOrders: number;
  totalDiscounts: number;
  totalTax: number;
  avgOrderValue: number;
}

export interface TopProduct {
  productId: string;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
  orderCount: number;
}

export interface RevenueByHour {
  hour: number;
  totalRevenue: number;
  orderCount: number;
}

export interface RevenueByChannel {
  channel: string;
  totalRevenue: number;
  orderCount: number;
  avgOrderValue: number;
}

export interface RevenueByDay {
  date: string;
  totalRevenue: number;
  orderCount: number;
  avgOrderValue: number;
}

// ─── Query helpers ────────────────────────────────────────────────────────────

async function runQuery<T>(query: string): Promise<T[]> {
  try {
    const result = await clickhouse.query({ query, format: 'JSONEachRow' });
    return (await result.json()) as T[];
  } catch (e) {
    console.warn('[reporting] ClickHouse query failed (non-critical):', e);
    return [];
  }
}

// ─── querySalesSummary ────────────────────────────────────────────────────────

export async function querySalesSummary(
  orgId: string,
  fromDate: string,
  toDate: string,
): Promise<SalesSummary> {
  const query = `
    SELECT
      sum(total)          AS totalRevenue,
      count()             AS totalOrders,
      sum(discount_total) AS totalDiscounts,
      sum(tax_total)      AS totalTax,
      avg(total)          AS avgOrderValue
    FROM nexus_analytics.sales_fact
    WHERE org_id = {orgId:String}
      AND completed_at >= {fromDate:DateTime}
      AND completed_at <  {toDate:DateTime}
  `;

  try {
    const result = await clickhouse.query({
      query,
      query_params: { orgId, fromDate, toDate },
      format: 'JSONEachRow',
    });
    const rows = (await result.json()) as Array<Record<string, number>>;
    if (!rows.length) {
      return { totalRevenue: 0, totalOrders: 0, totalDiscounts: 0, totalTax: 0, avgOrderValue: 0 };
    }
    const row = rows[0];
    return {
      totalRevenue: Number(row['totalRevenue'] ?? 0),
      totalOrders: Number(row['totalOrders'] ?? 0),
      totalDiscounts: Number(row['totalDiscounts'] ?? 0),
      totalTax: Number(row['totalTax'] ?? 0),
      avgOrderValue: Number(row['avgOrderValue'] ?? 0),
    };
  } catch (e) {
    console.warn('[reporting] querySalesSummary failed (non-critical):', e);
    return { totalRevenue: 0, totalOrders: 0, totalDiscounts: 0, totalTax: 0, avgOrderValue: 0 };
  }
}

// ─── queryTopProducts ─────────────────────────────────────────────────────────

export async function queryTopProducts(
  orgId: string,
  fromDate: string,
  toDate: string,
  limit = 10,
): Promise<TopProduct[]> {
  const query = `
    SELECT
      product_id                  AS productId,
      any(product_name)           AS productName,
      sum(quantity)               AS totalQuantity,
      sum(line_total)             AS totalRevenue,
      count(DISTINCT order_id)    AS orderCount
    FROM nexus_analytics.order_lines_fact
    WHERE org_id = {orgId:String}
      AND completed_at >= {fromDate:DateTime}
      AND completed_at <  {toDate:DateTime}
    GROUP BY product_id
    ORDER BY totalRevenue DESC
    LIMIT {limit:UInt32}
  `;

  try {
    const result = await clickhouse.query({
      query,
      query_params: { orgId, fromDate, toDate, limit },
      format: 'JSONEachRow',
    });
    const rows = (await result.json()) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      productId: String(r['productId']),
      productName: String(r['productName']),
      totalQuantity: Number(r['totalQuantity']),
      totalRevenue: Number(r['totalRevenue']),
      orderCount: Number(r['orderCount']),
    }));
  } catch (e) {
    console.warn('[reporting] queryTopProducts failed (non-critical):', e);
    return [];
  }
}

// ─── queryRevenueByHour ───────────────────────────────────────────────────────

export async function queryRevenueByHour(
  orgId: string,
  date: string,
): Promise<RevenueByHour[]> {
  const query = `
    SELECT
      hour                AS hour,
      sum(total)          AS totalRevenue,
      count()             AS orderCount
    FROM nexus_analytics.sales_fact
    WHERE org_id = {orgId:String}
      AND toDate(completed_at) = {date:Date}
    GROUP BY hour
    ORDER BY hour ASC
  `;

  try {
    const result = await clickhouse.query({
      query,
      query_params: { orgId, date },
      format: 'JSONEachRow',
    });
    const rows = (await result.json()) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      hour: Number(r['hour']),
      totalRevenue: Number(r['totalRevenue']),
      orderCount: Number(r['orderCount']),
    }));
  } catch (e) {
    console.warn('[reporting] queryRevenueByHour failed (non-critical):', e);
    return [];
  }
}

// ─── queryRevenueByChannel ────────────────────────────────────────────────────

export async function queryRevenueByChannel(
  orgId: string,
  fromDate: string,
  toDate: string,
): Promise<RevenueByChannel[]> {
  const query = `
    SELECT
      channel             AS channel,
      sum(total)          AS totalRevenue,
      count()             AS orderCount,
      avg(total)          AS avgOrderValue
    FROM nexus_analytics.sales_fact
    WHERE org_id = {orgId:String}
      AND completed_at >= {fromDate:DateTime}
      AND completed_at <  {toDate:DateTime}
    GROUP BY channel
    ORDER BY totalRevenue DESC
  `;

  try {
    const result = await clickhouse.query({
      query,
      query_params: { orgId, fromDate, toDate },
      format: 'JSONEachRow',
    });
    const rows = (await result.json()) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      channel: String(r['channel']),
      totalRevenue: Number(r['totalRevenue']),
      orderCount: Number(r['orderCount']),
      avgOrderValue: Number(r['avgOrderValue']),
    }));
  } catch (e) {
    console.warn('[reporting] queryRevenueByChannel failed (non-critical):', e);
    return [];
  }
}

// ─── queryRevenueByDay ────────────────────────────────────────────────────────

export async function queryRevenueByDay(
  orgId: string,
  fromDate: string,
  toDate: string,
): Promise<RevenueByDay[]> {
  const query = `
    SELECT
      toString(toDate(completed_at))  AS date,
      sum(total)                      AS totalRevenue,
      count()                         AS orderCount,
      avg(total)                      AS avgOrderValue
    FROM nexus_analytics.sales_fact
    WHERE org_id = {orgId:String}
      AND completed_at >= {fromDate:DateTime}
      AND completed_at <  {toDate:DateTime}
    GROUP BY date
    ORDER BY date ASC
  `;

  try {
    const result = await clickhouse.query({
      query,
      query_params: { orgId, fromDate, toDate },
      format: 'JSONEachRow',
    });
    const rows = (await result.json()) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      date: String(r['date']),
      totalRevenue: Number(r['totalRevenue']),
      orderCount: Number(r['orderCount']),
      avgOrderValue: Number(r['avgOrderValue']),
    }));
  } catch (e) {
    console.warn('[reporting] queryRevenueByDay failed (non-critical):', e);
    return [];
  }
}
