import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db';

const ingredientSchema = z.object({
  stockItemRef: z.string().min(1),
  ingredientName: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  wastagePercent: z.number().min(0).max(100).default(0),
  estimatedCostPerUnit: z.number().min(0).optional(),
  notes: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

const createRecipeSchema = z.object({
  productId: z.string().uuid().optional(),
  name: z.string().min(1),
  yieldQuantity: z.number().positive().default(1),
  yieldUnit: z.string().default('portion'),
  prepTimeMinutes: z.number().int().min(0).optional(),
  cookTimeMinutes: z.number().int().min(0).optional(),
  instructions: z.string().optional(),
  ingredients: z.array(ingredientSchema).default([]),
});

export async function recipeRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /api/v1/recipes — create recipe with ingredients
  app.post('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createRecipeSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const { ingredients, ...recipeData } = body.data;

    const [recipe] = await db.insert(schema.recipes).values({
      orgId,
      name: recipeData.name,
      yieldQuantity: String(recipeData.yieldQuantity),
      yieldUnit: recipeData.yieldUnit,
      productId: recipeData.productId ?? null,
      prepTimeMinutes: recipeData.prepTimeMinutes ?? null,
      cookTimeMinutes: recipeData.cookTimeMinutes ?? null,
      instructions: recipeData.instructions ?? null,
    }).returning();

    if (ingredients.length > 0) {
      await db.insert(schema.recipeIngredients).values(
        ingredients.map((ing) => ({
          recipeId: recipe!.id,
          stockItemRef: ing.stockItemRef,
          ingredientName: ing.ingredientName,
          quantity: String(ing.quantity),
          unit: ing.unit,
          wastagePercent: String(ing.wastagePercent),
          estimatedCostPerUnit: ing.estimatedCostPerUnit !== undefined ? String(ing.estimatedCostPerUnit) : null,
          notes: ing.notes ?? null,
          sortOrder: ing.sortOrder,
        })),
      );
    }

    const created = await db.query.recipes.findFirst({
      where: eq(schema.recipes.id, recipe!.id),
      with: { ingredients: { orderBy: (i, { asc }) => [asc(i.sortOrder)] } },
    });

    return reply.status(201).send({ data: created });
  });

  // GET /api/v1/recipes — list recipes for org
  app.get('/', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const q = request.query as { productId?: string; isActive?: string; limit?: string };
    const limit = Math.min(Number(q.limit ?? 50), 200);

    const results = await db.query.recipes.findMany({
      where: and(
        eq(schema.recipes.orgId, orgId),
        q.isActive !== undefined ? eq(schema.recipes.isActive, q.isActive === 'true') : undefined,
        q.productId ? eq(schema.recipes.productId, q.productId) : undefined,
      ),
      with: { ingredients: { orderBy: (i, { asc }) => [asc(i.sortOrder)] } },
      orderBy: [desc(schema.recipes.updatedAt)],
      limit,
    });

    return reply.status(200).send({ data: results, meta: { totalCount: results.length, hasMore: results.length === limit } });
  });

  // GET /api/v1/recipes/:id — get recipe with ingredients and computed cost
  app.get('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const recipe = await db.query.recipes.findFirst({
      where: and(eq(schema.recipes.id, id), eq(schema.recipes.orgId, orgId)),
      with: { ingredients: { orderBy: (i, { asc }) => [asc(i.sortOrder)] } },
    });

    if (!recipe) return reply.status(404).send({ title: 'Not Found', status: 404 });

    // Compute cost from ingredients
    const computedCost = (recipe as typeof recipe & { ingredients: typeof schema.recipeIngredients.$inferSelect[] }).ingredients.reduce((sum, ing) => {
      if (!ing.estimatedCostPerUnit) return sum;
      const qty = Number(ing.quantity);
      const waste = Number(ing.wastagePercent) / 100;
      const effectiveQty = qty * (1 + waste);
      return sum + effectiveQty * Number(ing.estimatedCostPerUnit);
    }, 0);

    return reply.status(200).send({ data: { ...recipe, computedCostPerYield: computedCost } });
  });

  // PATCH /api/v1/recipes/:id — update recipe
  app.patch('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const updateSchema = createRecipeSchema.partial();
    const body = updateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const existing = await db.query.recipes.findFirst({
      where: and(eq(schema.recipes.id, id), eq(schema.recipes.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const { ingredients, ...recipeData } = body.data;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (recipeData.name !== undefined) updateData['name'] = recipeData.name;
    if (recipeData.productId !== undefined) updateData['productId'] = recipeData.productId;
    if (recipeData.yieldQuantity !== undefined) updateData['yieldQuantity'] = String(recipeData.yieldQuantity);
    if (recipeData.yieldUnit !== undefined) updateData['yieldUnit'] = recipeData.yieldUnit;
    if (recipeData.prepTimeMinutes !== undefined) updateData['prepTimeMinutes'] = recipeData.prepTimeMinutes;
    if (recipeData.cookTimeMinutes !== undefined) updateData['cookTimeMinutes'] = recipeData.cookTimeMinutes;
    if (recipeData.instructions !== undefined) updateData['instructions'] = recipeData.instructions;

    type RecipeUpdate = typeof schema.recipes.$inferInsert;
    await db
      .update(schema.recipes)
      .set(updateData as unknown as RecipeUpdate)
      .where(and(eq(schema.recipes.id, id), eq(schema.recipes.orgId, orgId)));

    // If ingredients provided, replace all
    if (ingredients !== undefined) {
      await db.delete(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeId, id));
      if (ingredients.length > 0) {
        await db.insert(schema.recipeIngredients).values(
          ingredients.map((ing) => ({
            recipeId: id,
            stockItemRef: ing.stockItemRef,
            ingredientName: ing.ingredientName,
            quantity: String(ing.quantity),
            unit: ing.unit,
            wastagePercent: String(ing.wastagePercent),
            estimatedCostPerUnit: ing.estimatedCostPerUnit !== undefined ? String(ing.estimatedCostPerUnit) : null,
            notes: ing.notes ?? null,
            sortOrder: ing.sortOrder,
          })),
        );
      }
    }

    const result = await db.query.recipes.findFirst({
      where: eq(schema.recipes.id, id),
      with: { ingredients: { orderBy: (i, { asc }) => [asc(i.sortOrder)] } },
    });

    return reply.status(200).send({ data: result });
  });

  // DELETE /api/v1/recipes/:id — deactivate (soft delete)
  app.delete('/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    await db
      .update(schema.recipes)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(schema.recipes.id, id), eq(schema.recipes.orgId, orgId)));

    return reply.status(204).send();
  });

  // POST /api/v1/recipes/:id/cost — compute/update cost based on current ingredient prices
  app.post('/:id/cost', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };

    const recipe = await db.query.recipes.findFirst({
      where: and(eq(schema.recipes.id, id), eq(schema.recipes.orgId, orgId)),
      with: { ingredients: true },
    });
    if (!recipe) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const ingredients = (recipe as typeof recipe & { ingredients: typeof schema.recipeIngredients.$inferSelect[] }).ingredients;

    const costPerYield = ingredients.reduce((sum, ing) => {
      if (!ing.estimatedCostPerUnit) return sum;
      const qty = Number(ing.quantity);
      const waste = Number(ing.wastagePercent) / 100;
      const effectiveQty = qty * (1 + waste);
      return sum + effectiveQty * Number(ing.estimatedCostPerUnit);
    }, 0);

    const now = new Date();
    const [updated] = await db
      .update(schema.recipes)
      .set({ costPerYield: String(costPerYield.toFixed(4)), costCalculatedAt: now, updatedAt: now })
      .where(and(eq(schema.recipes.id, id), eq(schema.recipes.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: { ...updated, costPerYield } });
  });

  // ── Ingredient Stock Routes ─────────────────────────────────────────────────

  const createIngredientSchema = z.object({
    name: z.string().min(1),
    unit: z.enum(['kg', 'g', 'L', 'mL', 'each']),
    costPerUnit: z.number().min(0).default(0),
    currentStock: z.number().min(0).default(0),
    reorderPoint: z.number().min(0).default(0),
    supplierId: z.string().optional(),
  });

  const updateIngredientSchema = createIngredientSchema.partial();

  // GET /api/v1/recipes/ingredients — list ingredients for org
  app.get('/ingredients', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const results = await db.query.ingredients.findMany({
      where: eq(schema.ingredients.orgId, orgId),
      orderBy: [desc(schema.ingredients.createdAt)],
    });

    return reply.status(200).send({ data: results, meta: { totalCount: results.length } });
  });

  // POST /api/v1/recipes/ingredients — create ingredient
  app.post('/ingredients', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const body = createIngredientSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const [created] = await db
      .insert(schema.ingredients)
      .values({
        orgId,
        name: body.data.name,
        unit: body.data.unit,
        costPerUnit: String(body.data.costPerUnit),
        currentStock: String(body.data.currentStock),
        reorderPoint: String(body.data.reorderPoint),
        supplierId: body.data.supplierId ?? null,
      })
      .returning();

    return reply.status(201).send({ data: created });
  });

  // PATCH /api/v1/recipes/ingredients/:id — update ingredient
  app.patch('/ingredients/:id', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { id } = request.params as { id: string };
    const body = updateIngredientSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const existing = await db.query.ingredients.findFirst({
      where: and(eq(schema.ingredients.id, id), eq(schema.ingredients.orgId, orgId)),
    });
    if (!existing) return reply.status(404).send({ title: 'Not Found', status: 404 });

    const updateData: Record<string, unknown> = {};
    if (body.data.name !== undefined) updateData['name'] = body.data.name;
    if (body.data.unit !== undefined) updateData['unit'] = body.data.unit;
    if (body.data.costPerUnit !== undefined) updateData['costPerUnit'] = String(body.data.costPerUnit);
    if (body.data.currentStock !== undefined) updateData['currentStock'] = String(body.data.currentStock);
    if (body.data.reorderPoint !== undefined) updateData['reorderPoint'] = String(body.data.reorderPoint);
    if (body.data.supplierId !== undefined) updateData['supplierId'] = body.data.supplierId;

    type IngredientUpdate = typeof schema.ingredients.$inferInsert;
    const [updated] = await db
      .update(schema.ingredients)
      .set(updateData as unknown as IngredientUpdate)
      .where(and(eq(schema.ingredients.id, id), eq(schema.ingredients.orgId, orgId)))
      .returning();

    return reply.status(200).send({ data: updated });
  });

  // ── Product Recipe (ingredient mapping) Routes ──────────────────────────────

  // GET /api/v1/products/:productId/recipe — get product recipe (ingredient list)
  app.get('/products/:productId/recipe', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { productId } = request.params as { productId: string };

    const product = await db.query.products.findFirst({
      where: and(eq(schema.products.id, productId), eq(schema.products.orgId, orgId)),
    });
    if (!product) return reply.status(404).send({ title: 'Product Not Found', status: 404 });

    const recipeRows = await db.query.productRecipes.findMany({
      where: eq(schema.productRecipes.productId, productId),
      with: { ingredient: true },
    });

    return reply.status(200).send({
      data: {
        productId,
        ingredients: recipeRows.map((r) => ({
          id: r.id,
          ingredientId: r.ingredientId,
          ingredient: r.ingredient,
          quantity: r.quantity,
          createdAt: r.createdAt,
        })),
      },
    });
  });

  // POST /api/v1/products/:productId/recipe — set product recipe (replaces all rows)
  app.post('/products/:productId/recipe', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };
    const { productId } = request.params as { productId: string };

    const bodySchema = z.object({
      ingredients: z.array(
        z.object({
          ingredientId: z.string().uuid(),
          quantity: z.number().positive(),
        }),
      ),
    });

    const body = bodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    const product = await db.query.products.findFirst({
      where: and(eq(schema.products.id, productId), eq(schema.products.orgId, orgId)),
    });
    if (!product) return reply.status(404).send({ title: 'Product Not Found', status: 404 });

    // Replace all existing recipe rows for this product
    await db.delete(schema.productRecipes).where(eq(schema.productRecipes.productId, productId));

    if (body.data.ingredients.length > 0) {
      await db.insert(schema.productRecipes).values(
        body.data.ingredients.map((ing) => ({
          productId,
          ingredientId: ing.ingredientId,
          quantity: String(ing.quantity),
        })),
      );
    }

    const recipeRows = await db.query.productRecipes.findMany({
      where: eq(schema.productRecipes.productId, productId),
      with: { ingredient: true },
    });

    return reply.status(200).send({
      data: {
        productId,
        ingredients: recipeRows.map((r) => ({
          id: r.id,
          ingredientId: r.ingredientId,
          ingredient: r.ingredient,
          quantity: r.quantity,
          createdAt: r.createdAt,
        })),
      },
    });
  });

  // POST /api/v1/recipes/deduct — deduct ingredients for sold items
  app.post('/deduct', async (request, reply) => {
    const { orgId } = request.user as { orgId: string };

    const bodySchema = z.object({
      items: z.array(
        z.object({
          productId: z.string().uuid(),
          quantity: z.number().positive(),
        }),
      ),
    });

    const body = bodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ type: 'https://elevatedpos.com/errors/validation', title: 'Validation Error', status: 422, detail: body.error.message });
    }

    let deducted = 0;
    const lowStockAlerts: { ingredientId: string; name: string; currentStock: number; reorderPoint: number }[] = [];

    for (const item of body.data.items) {
      // Verify product belongs to org
      const product = await db.query.products.findFirst({
        where: and(eq(schema.products.id, item.productId), eq(schema.products.orgId, orgId)),
      });
      if (!product) continue;

      const recipeRows = await db.query.productRecipes.findMany({
        where: eq(schema.productRecipes.productId, item.productId),
        with: { ingredient: true },
      });

      for (const row of recipeRows) {
        const ing = row.ingredient;
        if (!ing) continue;

        const deductAmount = Number(row.quantity) * item.quantity;
        const newStock = Math.max(0, Number(ing.currentStock) - deductAmount);

        await db
          .update(schema.ingredients)
          .set({ currentStock: String(newStock.toFixed(4)) })
          .where(eq(schema.ingredients.id, ing.id));

        deducted += 1;

        // Check if stock fell below reorder point
        if (newStock <= Number(ing.reorderPoint)) {
          lowStockAlerts.push({
            ingredientId: ing.id,
            name: ing.name,
            currentStock: newStock,
            reorderPoint: Number(ing.reorderPoint),
          });
        }
      }
    }

    return reply.status(200).send({ deducted, lowStockAlerts });
  });
}
