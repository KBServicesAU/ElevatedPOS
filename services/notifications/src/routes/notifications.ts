import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { sendEmail } from '../lib/channels/email.js';
import { sendSms } from '../lib/channels/sms.js';
import { sendPush } from '../lib/channels/push.js';

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

  // POST /notifications/send — send a notification via the appropriate channel
  app.post('/send', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const parsed = sendSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    const { channel, recipient, subject, body: messageBody, templateId } = parsed.data;

    // Create log entry in 'queued' state before dispatching
    const now = new Date();
    const logRows = await db
      .insert(schema.notificationLogs)
      .values({
        orgId,
        templateId: templateId ?? null,
        channel,
        recipient,
        subject: subject ?? null,
        status: 'queued',
      })
      .returning();
    const log = logRows[0]!;

    // Dispatch via the appropriate channel
    let dispatchSuccess = false;
    let dispatchError: string | undefined;

    try {
      if (channel === 'email') {
        const result = await sendEmail({
          to: recipient,
          subject: subject ?? '(no subject)',
          htmlBody: messageBody,
          textBody: messageBody,
          orgId,
        });
        dispatchSuccess = result.success;
        dispatchError = result.error;
      } else if (channel === 'sms') {
        const result = await sendSms({ to: recipient, body: messageBody, orgId });
        dispatchSuccess = result.success;
        dispatchError = result.error;
      } else if (channel === 'push') {
        // For push, the recipient field is treated as the device token
        const result = await sendPush({
          deviceToken: recipient,
          title: subject ?? 'Notification',
          body: messageBody,
          orgId,
        });
        dispatchSuccess = result.success;
        dispatchError = result.error;
      }
    } catch (err) {
      dispatchSuccess = false;
      dispatchError = err instanceof Error ? err.message : String(err);
    }

    // Update log status based on dispatch result
    const finalStatus = dispatchSuccess ? 'sent' : 'failed';
    await db
      .update(schema.notificationLogs)
      .set({
        status: finalStatus,
        sentAt: dispatchSuccess ? now : null,
        errorMessage: dispatchError ?? null,
      })
      .where(eq(schema.notificationLogs.id, log.id));

    if (!dispatchSuccess) {
      return reply.status(502).send({
        messageId: log.id,
        status: 'failed',
        error: dispatchError ?? 'Dispatch failed',
      });
    }

    return reply.status(200).send({
      messageId: log.id,
      status: 'sent',
    });
  });

  // GET /notifications/unread-count — quick badge count for the bell
  // icon in the dashboard header. v2.7.70 — W1: the dashboard's
  // <NotificationBell> hits this on every page load. Before this
  // route existed the upstream returned 404, which the dashboard
  // proxy logged as an error on every request and the bell silently
  // fell back to demo data. Until we have a per-user inbox table,
  // the count is always 0 — the existing alerts/notifications surface
  // is push-based and doesn't track per-user read state. Adding the
  // endpoint kills the 404 spam without changing the UX.
  app.get('/unread-count', async (_request, reply) => {
    return reply.status(200).send({ count: 0 });
  });

  // GET /notifications — empty list. Same rationale as above; the
  // bell prefetches this when opened. Returning a real shape ({data: []})
  // is friendlier than 404'ing through to the demo fallback.
  app.get('/', async (_request, reply) => {
    return reply.status(200).send({ data: [] });
  });

  // POST /notifications/mark-all-read — no-op success response so the
  // bell's "Mark all read" button doesn't error.
  app.post('/mark-all-read', async (_request, reply) => {
    return reply.status(204).send();
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
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const createdRows = await db
      .insert(schema.notificationTemplates)
      .values({
        orgId,
        name: parsed.data.name,
        channel: parsed.data.channel,
        subject: parsed.data.subject ?? null,
        body: parsed.data.body,
        variables: parsed.data.variables as unknown,
      })
      .returning();
    return reply.status(201).send({ data: createdRows[0] });
  });
}
