import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const CHANNELS = ['email', 'sms', 'push'] as const;

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  channel: z.enum(CHANNELS),
  subject: z.string().optional(),
  body: z.string().min(1),
  variables: z.array(z.string()).default([]),
});

const updateTemplateSchema = createTemplateSchema.partial();

const previewSchema = z.object({
  sampleData: z.record(z.string()).default({}),
});

/**
 * Replaces {{variable}} placeholders in a template string with values from
 * the provided sample data map. Unknown placeholders are left as-is.
 */
function renderTemplate(template: string, sampleData: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return sampleData[key] !== undefined ? sampleData[key] : match;
  });
}

export async function templateRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST / — create template
  app.post('/', async (request, reply) => {
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
    const { channel, ...rest } = parsed.data;
    if (channel === 'email' && !rest.subject) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: 'subject is required for email templates',
      });
    }
    const [created] = await db
      .insert(schema.campaignTemplates)
      .values({ orgId, channel, ...rest, variables: rest.variables })
      .returning();
    return reply.status(201).send({ data: created });
  });

  // GET / — list templates (exclude soft-deleted)
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const templates = await db.query.campaignTemplates.findMany({
      where: and(
        eq(schema.campaignTemplates.orgId, orgId),
        eq(schema.campaignTemplates.isDeleted, false),
      ),
    });
    return reply.status(200).send({ data: templates });
  });

  // GET /:id — template detail
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const template = await db.query.campaignTemplates.findFirst({
      where: and(
        eq(schema.campaignTemplates.id, id),
        eq(schema.campaignTemplates.orgId, orgId),
        eq(schema.campaignTemplates.isDeleted, false),
      ),
    });
    if (!template) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Template ${id} not found`,
      });
    }
    return reply.status(200).send({ data: template });
  });

  // POST /:id/preview — render template with sample data
  app.post('/:id/preview', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const template = await db.query.campaignTemplates.findFirst({
      where: and(
        eq(schema.campaignTemplates.id, id),
        eq(schema.campaignTemplates.orgId, orgId),
        eq(schema.campaignTemplates.isDeleted, false),
      ),
    });
    if (!template) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Template ${id} not found`,
      });
    }

    const parsed = previewSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    const sampleData = parsed.data.sampleData;
    const renderedBody = renderTemplate(template.body, sampleData);
    const renderedSubject = template.subject ? renderTemplate(template.subject, sampleData) : null;

    return reply.status(200).send({
      data: {
        templateId: id,
        channel: template.channel,
        subject: renderedSubject,
        body: renderedBody,
        sampleData,
      },
    });
  });

  // PATCH /:id — update template
  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.campaignTemplates.findFirst({
      where: and(
        eq(schema.campaignTemplates.id, id),
        eq(schema.campaignTemplates.orgId, orgId),
        eq(schema.campaignTemplates.isDeleted, false),
      ),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Template ${id} not found`,
      });
    }

    const parsed = updateTemplateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    const [updated] = await db
      .update(schema.campaignTemplates)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(schema.campaignTemplates.id, id), eq(schema.campaignTemplates.orgId, orgId)))
      .returning();
    return reply.status(200).send({ data: updated });
  });

  // DELETE /:id — soft delete
  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const existing = await db.query.campaignTemplates.findFirst({
      where: and(
        eq(schema.campaignTemplates.id, id),
        eq(schema.campaignTemplates.orgId, orgId),
        eq(schema.campaignTemplates.isDeleted, false),
      ),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Template ${id} not found`,
      });
    }

    await db
      .update(schema.campaignTemplates)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(schema.campaignTemplates.id, id), eq(schema.campaignTemplates.orgId, orgId)));
    return reply.status(204).send();
  });
}
