import type { FastifyInstance } from 'fastify';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const VALID_CHANNELS = ['email', 'sms', 'push'] as const;
const VALID_STATUSES = ['queued', 'sent', 'failed'] as const;

type Channel = (typeof VALID_CHANNELS)[number];
type Status = (typeof VALID_STATUSES)[number];

export async function logsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /logs — list notification logs with filtering
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as {
      channel?: string;
      status?: string;
      from?: string;
      to?: string;
      limit?: string;
      offset?: string;
    };

    const limit = Math.min(Number(q.limit ?? 50), 200);
    const offset = Number(q.offset ?? 0);

    const channel = VALID_CHANNELS.includes(q.channel as Channel) ? (q.channel as Channel) : undefined;
    const status = VALID_STATUSES.includes(q.status as Status) ? (q.status as Status) : undefined;
    const fromDate = q.from ? new Date(q.from) : undefined;
    const toDate = q.to ? new Date(q.to) : undefined;

    // Build conditions array
    const conditions = [eq(schema.notificationLogs.orgId, orgId)];
    if (channel) conditions.push(eq(schema.notificationLogs.channel, channel));
    if (status) conditions.push(eq(schema.notificationLogs.status, status));
    if (fromDate && !isNaN(fromDate.getTime())) {
      conditions.push(gte(schema.notificationLogs.createdAt, fromDate));
    }
    if (toDate && !isNaN(toDate.getTime())) {
      conditions.push(lte(schema.notificationLogs.createdAt, toDate));
    }

    const logs = await db.query.notificationLogs.findMany({
      where: and(...conditions),
      orderBy: [desc(schema.notificationLogs.createdAt)],
      limit,
      offset,
    });

    return reply.status(200).send({ data: logs, meta: { limit, offset, count: logs.length } });
  });

  // GET /logs/stats — counts by channel and status for last 30 days
  app.get('/stats', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        channel: schema.notificationLogs.channel,
        status: schema.notificationLogs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.notificationLogs)
      .where(
        and(
          eq(schema.notificationLogs.orgId, orgId),
          gte(schema.notificationLogs.createdAt, since),
        ),
      )
      .groupBy(schema.notificationLogs.channel, schema.notificationLogs.status);

    // Shape into a nested { channel: { status: count } } map
    const stats: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      if (!stats[row.channel]) stats[row.channel] = {};
      stats[row.channel]![row.status] = row.count;
    }

    // Ensure all channels are present
    for (const ch of VALID_CHANNELS) {
      if (!stats[ch]) stats[ch] = {};
      for (const st of VALID_STATUSES) {
        if (!stats[ch]![st]) stats[ch]![st] = 0;
      }
    }

    const totals: Record<string, number> = {};
    for (const st of VALID_STATUSES) {
      totals[st] = VALID_CHANNELS.reduce((sum, ch) => sum + (stats[ch]?.[st] ?? 0), 0);
    }

    return reply.status(200).send({
      period: { from: since.toISOString(), to: new Date().toISOString() },
      byChannel: stats,
      totals,
    });
  });
}
