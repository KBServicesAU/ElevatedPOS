import { clickhouse } from './clickhouse.js';

export async function ingestOrder(order: {
  id: string;
  orgId: string;
  locationId: string;
  channel: string;
  orderType: string;
  customerId?: string;
  employeeId?: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  completedAt: string;
  createdAt: string;
  lines?: Array<{
    id: string;
    productId: string;
    productName: string;
    categoryId?: string;
    quantity: number;
    unitPrice: number;
    costPrice: number;
    lineTotal: number;
    discountAmount: number;
  }>;
}) {
  const completedAt = new Date(order.completedAt);

  try {
    await clickhouse.insert({
      table: 'elevatedpos_analytics.sales_fact',
      values: [
        {
          order_id: order.id,
          org_id: order.orgId,
          location_id: order.locationId,
          channel: order.channel,
          order_type: order.orderType,
          customer_id: order.customerId ?? null,
          employee_id: order.employeeId ?? null,
          subtotal: order.subtotal,
          discount_total: order.discountTotal,
          tax_total: order.taxTotal,
          total: order.total,
          completed_at: completedAt,
          created_at: new Date(order.createdAt),
          year: completedAt.getFullYear(),
          month: completedAt.getMonth() + 1,
          day_of_week: completedAt.getDay(),
          hour: completedAt.getHours(),
        },
      ],
      format: 'JSONEachRow',
    });

    if (order.lines?.length) {
      await clickhouse.insert({
        table: 'elevatedpos_analytics.order_lines_fact',
        values: order.lines.map((l) => ({
          line_id: l.id,
          order_id: order.id,
          org_id: order.orgId,
          location_id: order.locationId,
          product_id: l.productId,
          product_name: l.productName,
          category_id: l.categoryId ?? null,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          cost_price: l.costPrice,
          line_total: l.lineTotal,
          discount_amount: l.discountAmount,
          completed_at: completedAt,
        })),
        format: 'JSONEachRow',
      });
    }
  } catch (e) {
    console.warn('ClickHouse ingest failed (non-critical):', e);
  }
}
