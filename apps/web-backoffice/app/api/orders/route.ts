import { type NextRequest } from 'next/server';
import { ordersStore } from '@/lib/store';

/**
 * GET /api/orders
 * Returns orders from the in-memory store (used as dashboard fallback when
 * the orders microservice is offline).
 *
 * Supports query params: status, channel, search, limit
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const filters = {
    status: searchParams.get('status') ?? undefined,
    channel: searchParams.get('channel') ?? undefined,
    search: searchParams.get('search') ?? undefined,
    limit: Number(searchParams.get('limit') ?? 50),
  };

  const result = ordersStore.toDashboardList(filters);
  return Response.json(result);
}
