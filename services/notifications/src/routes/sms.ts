import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { db, schema } from '../db/index.js';

const smsSchema = z.object({
  to: z.string().min(7).max(20), // E.164 phone number, e.g. +61412345678
  message: z.string().min(1).max(1600),
  orgId: z.string().uuid(),
});

export async function smsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /sms — send an SMS notification
  app.post('/', async (request, reply) => {
    const parsed = smsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    const { to, message, orgId } = parsed.data;
    const messageId = crypto.randomUUID();

    // Mock Twilio: log SMS
    console.log('[notifications/sms] MOCK TWILIO — sending SMS', {
      messageId,
      to,
      message: message.slice(0, 100) + (message.length > 100 ? '…' : ''),
      orgId,
    });

    // Save to notificationLogs
    await db.insert(schema.notificationLogs).values({
      id: messageId,
      orgId,
      channel: 'sms',
      recipient: to,
      subject: null,
      status: 'sent',
      sentAt: new Date(),
    });

    return reply.status(200).send({ messageId, to, status: 'sent' });
  });
}
