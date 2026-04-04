import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db';

// ── Zod schemas ────────────────────────────────────────────────────────────────

const createGroupSchema = z.object({
  name: z.string().min(1).max(255),
  displayName: z.string().max(255).optional(),
  required: z.boolean().default(false),
  minSelections: z.number().int().min(0).default(0),
  maxSelections: z.number().int().min(1).default(1),
  allowMultiple: z.boolean().default(false),
  isRoot: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

const createOptionSchema = z.object({
  name: z.string().min(1).max(255),
  priceAdjustment: z.number().default(0),
  sku: z.string().max(100).optional(),
  barcode: z.string().max(100).optional(),
  imageUrl: z.string().url().optional(),
  color: z.string().max(20).optional(),
  sortOrder: z.number().int().default(0),
  isAvailable: z.boolean().default(true),
});

const createRuleSchema = z.object({
  parentOptionId: z.string().uuid(),
  childGroupId: z.string().uuid(),
  sortOrder: z.number().int().default(0),
});

// ── Helper: verify product belongs to org ─────────────────────────────────────

async function assertProductOwnership(productId: string, orgId: string): Promise<boolean> {
  const product = await db.query.products.findFirst({
    where: and(eq(schema.products.id, productId), eq(schema.products.orgId, orgId)),
    columns: { id: true },
  });
  return product !== undefined;
}

// ── Plugin ─────────────────────────────────────────────────────────────────────

export async function variantRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // ── GET /products/:productId/variants — full variant tree ─────────────────

  app.get('/products/:productId/variants', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { productId } = request.params as { productId: string };

    if (!(await assertProductOwnership(productId, orgId))) {
      return reply.status(404).send({ title: 'Not Found', status: 404 });
    }

    // Load all groups for the product
    const groups = await db.query.productVariantGroups.findMany({
      where: eq(schema.productVariantGroups.productId, productId),
      with: { options: { with: { rules: true } } },
      orderBy: [schema.productVariantGroups.sortOrder],
    });

    // Shape the response
    const shaped = groups.map((g) => ({
      id: g.id,
      name: g.name,
      displayName: g.displayName,
      required: g.required,
      minSelections: g.minSelections,
      maxSelections: g.maxSelections,
      allowMultiple: g.allowMultiple,
      isRoot: g.isRoot,
      sortOrder: g.sortOrder,
      isActive: g.isActive,
      options: g.options
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((o) => ({
          id: o.id,
          name: o.name,
          priceAdjustment: o.priceAdjustment,
          sku: o.sku,
          barcode: o.barcode,
          imageUrl: o.imageUrl,
          color: o.color,
          sortOrder: o.sortOrder,
          isAvailable: o.isAvailable,
          triggersGroups: o.rules
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((r) => r.childGroupId),
        })),
    }));

    return reply.status(200).send({ groups: shaped });
  });

  // ── POST /products/:productId/variant-groups — create a group ─────────────

  app.post('/products/:productId/variant-groups', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { productId } = request.params as { productId: string };

    if (!(await assertProductOwnership(productId, orgId))) {
      return reply.status(404).send({ title: 'Not Found', status: 404 });
    }

    const body = createGroupSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const { displayName: rawDisplayName, ...groupRest } = body.data;
    const [created] = await db
      .insert(schema.productVariantGroups)
      .values({ ...groupRest, productId, displayName: rawDisplayName ?? null })
      .returning();

    return reply.status(201).send({ data: created });
  });

  // ── PATCH /products/:productId/variant-groups/:groupId ────────────────────

  app.patch('/products/:productId/variant-groups/:groupId', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { productId, groupId } = request.params as { productId: string; groupId: string };

    if (!(await assertProductOwnership(productId, orgId))) {
      return reply.status(404).send({ title: 'Not Found', status: 404 });
    }

    const body = createGroupSchema.partial().safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const setData: Record<string, unknown> = {};
    const bd = body.data;
    if (bd.name !== undefined) setData['name'] = bd.name;
    if (bd.displayName !== undefined) setData['displayName'] = bd.displayName ?? null;
    if (bd.required !== undefined) setData['required'] = bd.required;
    if (bd.minSelections !== undefined) setData['minSelections'] = bd.minSelections;
    if (bd.maxSelections !== undefined) setData['maxSelections'] = bd.maxSelections;
    if (bd.allowMultiple !== undefined) setData['allowMultiple'] = bd.allowMultiple;
    if (bd.isRoot !== undefined) setData['isRoot'] = bd.isRoot;
    if (bd.sortOrder !== undefined) setData['sortOrder'] = bd.sortOrder;
    if (bd.isActive !== undefined) setData['isActive'] = bd.isActive;

    type GroupUpdate = typeof schema.productVariantGroups.$inferInsert;
    const [updated] = await db
      .update(schema.productVariantGroups)
      .set(setData as unknown as GroupUpdate)
      .where(
        and(
          eq(schema.productVariantGroups.id, groupId),
          eq(schema.productVariantGroups.productId, productId),
        ),
      )
      .returning();

    if (!updated) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: updated });
  });

  // ── DELETE /products/:productId/variant-groups/:groupId ───────────────────

  app.delete('/products/:productId/variant-groups/:groupId', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { productId, groupId } = request.params as { productId: string; groupId: string };

    if (!(await assertProductOwnership(productId, orgId))) {
      return reply.status(404).send({ title: 'Not Found', status: 404 });
    }

    await db
      .delete(schema.productVariantGroups)
      .where(
        and(
          eq(schema.productVariantGroups.id, groupId),
          eq(schema.productVariantGroups.productId, productId),
        ),
      );

    return reply.status(204).send();
  });

  // ── POST /products/:productId/variant-groups/:groupId/options ─────────────

  app.post('/products/:productId/variant-groups/:groupId/options', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { productId, groupId } = request.params as { productId: string; groupId: string };

    if (!(await assertProductOwnership(productId, orgId))) {
      return reply.status(404).send({ title: 'Not Found', status: 404 });
    }

    // Verify group belongs to this product
    const group = await db.query.productVariantGroups.findFirst({
      where: and(
        eq(schema.productVariantGroups.id, groupId),
        eq(schema.productVariantGroups.productId, productId),
      ),
      columns: { id: true },
    });
    if (!group) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const body = createOptionSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const { sku: rawSku, barcode: rawBarcode, imageUrl: rawImageUrl, color: rawColor, priceAdjustment: rawPrice, ...optionRest } = body.data;
    const [created] = await db
      .insert(schema.productVariantOptions)
      .values({
        ...optionRest,
        groupId,
        priceAdjustment: String(rawPrice),
        sku: rawSku ?? null,
        barcode: rawBarcode ?? null,
        imageUrl: rawImageUrl ?? null,
        color: rawColor ?? null,
      })
      .returning();

    return reply.status(201).send({ data: created });
  });

  // ── PATCH /products/:productId/variant-groups/:groupId/options/:optionId ──

  app.patch('/products/:productId/variant-groups/:groupId/options/:optionId', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { productId, groupId, optionId } = request.params as { productId: string; groupId: string; optionId: string };

    if (!(await assertProductOwnership(productId, orgId))) {
      return reply.status(404).send({ title: 'Not Found', status: 404 });
    }

    const body = createOptionSchema.partial().safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const setData: Record<string, unknown> = {};
    const bd = body.data;
    if (bd.name !== undefined) setData['name'] = bd.name;
    if (bd.priceAdjustment !== undefined) setData['priceAdjustment'] = String(bd.priceAdjustment);
    if (bd.sku !== undefined) setData['sku'] = bd.sku ?? null;
    if (bd.barcode !== undefined) setData['barcode'] = bd.barcode ?? null;
    if (bd.imageUrl !== undefined) setData['imageUrl'] = bd.imageUrl ?? null;
    if (bd.color !== undefined) setData['color'] = bd.color ?? null;
    if (bd.sortOrder !== undefined) setData['sortOrder'] = bd.sortOrder;
    if (bd.isAvailable !== undefined) setData['isAvailable'] = bd.isAvailable;

    type OptionUpdate = typeof schema.productVariantOptions.$inferInsert;
    const [updated] = await db
      .update(schema.productVariantOptions)
      .set(setData as unknown as OptionUpdate)
      .where(
        and(
          eq(schema.productVariantOptions.id, optionId),
          eq(schema.productVariantOptions.groupId, groupId),
        ),
      )
      .returning();

    if (!updated) return reply.status(404).send({ title: 'Not Found', status: 404 });
    return reply.status(200).send({ data: updated });
  });

  // ── DELETE /products/:productId/variant-groups/:groupId/options/:optionId ─

  app.delete('/products/:productId/variant-groups/:groupId/options/:optionId', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { productId, groupId, optionId } = request.params as { productId: string; groupId: string; optionId: string };

    if (!(await assertProductOwnership(productId, orgId))) {
      return reply.status(404).send({ title: 'Not Found', status: 404 });
    }

    await db
      .delete(schema.productVariantOptions)
      .where(
        and(
          eq(schema.productVariantOptions.id, optionId),
          eq(schema.productVariantOptions.groupId, groupId),
        ),
      );

    return reply.status(204).send();
  });

  // ── POST /products/:productId/variant-rules — create a conditional rule ───

  app.post('/products/:productId/variant-rules', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { productId } = request.params as { productId: string };

    if (!(await assertProductOwnership(productId, orgId))) {
      return reply.status(404).send({ title: 'Not Found', status: 404 });
    }

    const body = createRuleSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const [created] = await db
      .insert(schema.productVariantRules)
      .values({
        parentOptionId: body.data.parentOptionId,
        childGroupId: body.data.childGroupId,
        sortOrder: body.data.sortOrder,
      })
      .returning();

    return reply.status(201).send({ data: created });
  });

  // ── DELETE /products/:productId/variant-rules/:ruleId ─────────────────────

  app.delete('/products/:productId/variant-rules/:ruleId', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { productId, ruleId } = request.params as { productId: string; ruleId: string };

    if (!(await assertProductOwnership(productId, orgId))) {
      return reply.status(404).send({ title: 'Not Found', status: 404 });
    }

    await db
      .delete(schema.productVariantRules)
      .where(eq(schema.productVariantRules.id, ruleId));

    return reply.status(204).send();
  });
}
