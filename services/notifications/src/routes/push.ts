import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { db, schema } from '../db/index.js';

const pushSchema = z.object({
  deviceToken: z.string().min(1),
  title: z.string().min(1).max(255),
  body: z.string().min(1),
  data: z.record(z.unknown()).optional(),
  orgId: z.string().uuid(),
});

const pushBulkSchema = z.object({
  deviceTokens: z.array(z.string().min(1)).min(1).max(1000),
  title: z.string().min(1).max(255),
  body: z.string().min(1),
  data: z.record(z.unknown()).optional(),
  orgId: z.string().uuid(),
});

export async function pushRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /push — send a push notification to a single device
  app.post('/', async (request, reply) => {
    const parsed = pushSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    const { deviceToken, title, body: messageBody, data, orgId } = parsed.data;
    const messageId = crypto.randomUUID();

    // Mock FCM: log push notification
    console.log('[notifications/push] MOCK FCM — sending push notification', {
      messageId,
      deviceToken: deviceToken.slice(0, 12) + '…',
      title,
      body: messageBody,
      data,
      orgId,
    });

    // Save to notificationLogs (device token stored as recipient)
    await db.insert(schema.notificationLogs).values({
      id: messageId,
      orgId,
      channel: 'push',
      recipient: deviceToken,
      subject: title,
      status: 'sent',
      sentAt: new Date(),
    });

    return reply.status(200).send({ messageId, status: 'sent' });
  });

  // POST /push/bulk — send push notification to multiple devices
  app.post('/bulk', async (request, reply) => {
    const parsed = pushBulkSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    const { deviceTokens, title, body: messageBody, data, orgId } = parsed.data;

    // Mock FCM bulk send: log and insert a log entry per device
    console.log('[notifications/push] MOCK FCM — bulk push notification', {
      count: deviceTokens.length,
      title,
      body: messageBody,
      data,
      orgId,
    });

    const now = new Date();
    const insertValues = deviceTokens.map((token) => ({
      id: crypto.randomUUID(),
      orgId,
      channel: 'push' as const,
      recipient: token,
      subject: title,
      status: 'sent' as const,
      sentAt: now,
    }));

    // Insert in batches of 100 to avoid parameter limits
    for (let i = 0; i < insertValues.length; i += 100) {
      await db.insert(schema.notificationLogs).values(insertValues.slice(i, i + 100));
    }

    return reply.status(200).send({ sent: deviceTokens.length, failed: 0 });
  });
}
