import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { getTemporalClient } from '../temporal/client.js';
import { automationTriggerWorkflow } from '../temporal/workflows.js';

const VALID_TRIGGERS = [
  'order_completed',
  'customer_created',
  'loyalty_tier_changed',
  'low_stock',
  'birthday',
] as const;

const createRuleSchema = z.object({
  name: z.string().min(1).max(255),
  trigger: z.enum(VALID_TRIGGERS),
  conditions: z.array(z.record(z.unknown())).default([]),
  actions: z.array(z.record(z.unknown())).default([]),
  enabled: z.boolean().default(true),
});

const triggerEventSchema = z.object({
  trigger: z.enum(VALID_TRIGGERS),
  orgId: z.string().uuid(),
  payload: z.record(z.unknown()).default({}),
});

export async function automationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // GET /automations — list rules for org
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const rules = await db.query.automationRules.findMany({
      where: eq(schema.automationRules.orgId, orgId),
    });
    return reply.status(200).send({ data: rules });
  });

  // POST /automations — create rule
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const parsed = createRuleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const [created] = await db
      .insert(schema.automationRules)
      .values({ orgId, ...parsed.data })
      .returning();
    return reply.status(201).send({ data: created });
  });

  // PATCH /automations/:id — update rule
  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const parsed = createRuleSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }
    const existing = await db.query.automationRules.findFirst({
      where: and(eq(schema.automationRules.id, id), eq(schema.automationRules.orgId, orgId)),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Automation rule ${id} not found`,
      });
    }
    const rowArray = await db
      .update(schema.automationRules)
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.trigger !== undefined ? { trigger: parsed.data.trigger } : {}),
        ...(parsed.data.conditions !== undefined ? { conditions: parsed.data.conditions } : {}),
        ...(parsed.data.actions !== undefined ? { actions: parsed.data.actions } : {}),
        ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.automationRules.id, id), eq(schema.automationRules.orgId, orgId)))
      .returning();
    const updated = rowArray[0]!;
    return reply.status(200).send({ data: updated });
  });

  // DELETE /automations/:id — delete rule
  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const existing = await db.query.automationRules.findFirst({
      where: and(eq(schema.automationRules.id, id), eq(schema.automationRules.orgId, orgId)),
    });
    if (!existing) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Automation rule ${id} not found`,
      });
    }
    await db
      .delete(schema.automationRules)
      .where(and(eq(schema.automationRules.id, id), eq(schema.automationRules.orgId, orgId)));
    return reply.status(204).send();
  });

  // POST /automations/trigger — receive trigger event, match rules, create executions
  app.post('/trigger', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const parsed = triggerEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    // Use orgId from JWT, not from body, for security
    const matchingRules = await db.query.automationRules.findMany({
      where: and(
        eq(schema.automationRules.orgId, orgId),
        eq(schema.automationRules.trigger, parsed.data.trigger),
        eq(schema.automationRules.enabled, true),
      ),
    });

    if (matchingRules.length > 0) {
      await db.insert(schema.automationExecutions).values(
        matchingRules.map((rule) => ({
          orgId,
          ruleId: rule.id,
          triggerPayload: parsed.data.payload,
          status: 'pending' as const,
        })),
      );
    }

    return reply.status(200).send({
      data: {
        triggeredCount: matchingRules.length,
        trigger: parsed.data.trigger,
        rulesTriggered: matchingRules.map((r) => r.id),
      },
    });
  });

  // POST /automations/:id/trigger — start a Temporal workflow for a specific rule
  app.post('/:id/trigger', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const triggerDataSchema = z.object({
      triggerData: z.record(z.unknown()).optional().default({}),
    });
    const bodyParsed = triggerDataSchema.safeParse(request.body ?? {});
    if (!bodyParsed.success) {
      return reply.status(422).send({
        type: 'https://nexus.app/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: bodyParsed.error.message,
      });
    }

    const rule = await db.query.automationRules.findFirst({
      where: and(eq(schema.automationRules.id, id), eq(schema.automationRules.orgId, orgId)),
    });
    if (!rule) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Automation rule ${id} not found`,
      });
    }

    // Create a pending execution record
    const [execution] = await db
      .insert(schema.automationExecutions)
      .values({
        orgId,
        ruleId: id,
        triggerPayload: bodyParsed.data.triggerData,
        status: 'pending',
        startedAt: new Date(),
      })
      .returning();

    const client = await getTemporalClient();

    if (!client) {
      return reply.status(200).send({
        data: {
          status: 'queued',
          executionId: execution?.id,
          message: 'Temporal not available, execution queued',
        },
      });
    }

    try {
      const workflowId = `automation-${id}-${Date.now()}`;
      const handle = await client.workflow.start(automationTriggerWorkflow, {
        taskQueue: 'elevatedpos-automations',
        workflowId,
        args: [{ automationId: id, triggerData: bodyParsed.data.triggerData, orgId }],
      });

      // Update execution record with workflow identifiers
      if (execution) {
        await db
          .update(schema.automationExecutions)
          .set({
            workflowId: handle.workflowId,
            runId: handle.firstExecutionRunId,
            status: 'running',
          })
          .where(eq(schema.automationExecutions.id, execution.id));
      }

      return reply.status(200).send({
        data: {
          workflowId: handle.workflowId,
          runId: handle.firstExecutionRunId,
          executionId: execution?.id,
        },
      });
    } catch (err) {
      app.log.error({ err }, 'Failed to start Temporal workflow');
      return reply.status(200).send({
        data: {
          status: 'queued',
          executionId: execution?.id,
          message: `Temporal workflow start failed, execution queued: ${String(err)}`,
        },
      });
    }
  });

  // GET /automations/:id/executions — list recent executions for a rule
  app.get('/:id/executions', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const { limit = '20', offset = '0' } = request.query as {
      limit?: string;
      offset?: string;
    };

    const rule = await db.query.automationRules.findFirst({
      where: and(eq(schema.automationRules.id, id), eq(schema.automationRules.orgId, orgId)),
    });
    if (!rule) {
      return reply.status(404).send({
        type: 'https://nexus.app/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Automation rule ${id} not found`,
      });
    }

    const executions = await db
      .select()
      .from(schema.automationExecutions)
      .where(
        and(
          eq(schema.automationExecutions.ruleId, id),
          eq(schema.automationExecutions.orgId, orgId),
        ),
      )
      .orderBy(desc(schema.automationExecutions.createdAt))
      .limit(Math.min(Number(limit), 100))
      .offset(Number(offset));

    return reply.status(200).send({ data: executions });
  });
}
