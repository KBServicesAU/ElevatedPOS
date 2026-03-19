import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const CHANNELS = ['email', 'sms', 'push'] as const;

const sendSchema = z.object({
  channel: z.enum(CHANNELS),
  recipient: z.string().min(1).max(255),
  templateId: z.string().uuid().optional(),
  subject: z.string().optional(),
  body: z.string().min(1),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  channel: z.enum(CHANNELS),
  subject: z.string().optional(),
  body: z.string().min(1),
  variables: z.array(z.string()).default([]),
});

export async function notificationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /notifications/send — send a notification
  app.post('/send', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const parsed = sendSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    const now = new Date();
    const [log] = await db
      .insert(schema.notificationLogs)
      .values({
        orgId,
        templateId: parsed.data.templateId ?? null,
        channel: parsed.data.channel,
        recipient: parsed.data.recipient,
        subject: parsed.data.subject ?? null,
        status: 'sent',
        sentAt: now,
      })
      .returning();

    return reply.status(200).send({
      messageId: log.id,
      status: 'sent',
    });
  });

  // GET /notifications/logs — list notification logs with pagination
  app.get('/logs', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { limit?: string; offset?: string };
    const limit = Math.min(Number(q.limit ?? 50), 200);
    const offset = Number(q.offset ?? 0);

    const logs = await db.query.notificationLogs.findMany({
      where: eq(schema.notificationLogs.orgId, orgId),
      orderBy: [desc(schema.notificationLogs.createdAt)],
      limit,
      offset,
    });
    return reply.status(200).send({ data: logs, meta: { limit, offset } });
  });

  // GET /notifications/templates — list templates
  app.get('/templates', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const templates = await db.query.notificationTemplates.findMany({
      where: eq(schema.notificationTemplates.orgId, orgId),
    });
    return reply.status(200).send({ data: templates });
  });

  // POST /notifications/templates — create template
  app.post('/templates', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const parsed = createTemplateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const [created] = await db
      .insert(schema.notificationTemplates)
      .values({ orgId, ...parsed.data })
      .returning();
    return reply.status(201).send({ data: created });
  });
}
