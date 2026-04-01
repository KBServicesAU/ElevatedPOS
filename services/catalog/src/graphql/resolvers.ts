import { eq, and, ilike, desc } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { db, schema } from '../db/index';

interface GqlContext {
  request: FastifyRequest & { user?: { orgId: string } };
}

function getOrgId(ctx: GqlContext): string {
  const orgId = ctx.request.user?.orgId;
  if (!orgId) throw new Error('Unauthorized: missing orgId in token');
  return orgId;
}

export const resolvers = {
  Query: {
    async products(
      _: unknown,
      args: { orgId: string; categoryId?: string; search?: string; isActive?: boolean; limit?: number },
      ctx: GqlContext,
    ) {
      const orgId = getOrgId(ctx);
      const limit = Math.min(args.limit ?? 50, 200);

      const conditions = [eq(schema.products.orgId, orgId)];
      if (args.categoryId) conditions.push(eq(schema.products.categoryId, args.categoryId));
      if (args.isActive !== undefined) conditions.push(eq(schema.products.isActive, args.isActive));
      if (args.search) conditions.push(ilike(schema.products.name, `%${args.search}%`));

      const rows = await db.query.products.findMany({
        where: and(...conditions),
        with: { category: true },
        orderBy: [desc(schema.products.updatedAt)],
        limit,
      });

      return rows.map(normalizeProduct);
    },

    async product(_: unknown, args: { id: string }, ctx: GqlContext) {
      const orgId = getOrgId(ctx);

      const row = await db.query.products.findFirst({
        where: and(eq(schema.products.id, args.id), eq(schema.products.orgId, orgId)),
        with: { category: true },
      });

      if (!row) return null;
      return normalizeProduct(row);
    },

    async categories(_: unknown, _orgArgs: { orgId: string }, ctx: GqlContext) {
      const orgId = getOrgId(ctx);

      const rows = await db.query.categories.findMany({
        where: eq(schema.categories.orgId, orgId),
        orderBy: [desc(schema.categories.sortOrder)],
      });

      return rows.map((c) => normalizeCategory(c, []));
    },

    async category(_: unknown, args: { id: string }, ctx: GqlContext) {
      const orgId = getOrgId(ctx);

      const row = await db.query.categories.findFirst({
        where: and(eq(schema.categories.id, args.id), eq(schema.categories.orgId, orgId)),
      });

      if (!row) return null;

      const products = await db.query.products.findMany({
        where: and(eq(schema.products.categoryId, args.id), eq(schema.products.orgId, orgId)),
        orderBy: [desc(schema.products.updatedAt)],
        limit: 100,
      });

      return normalizeCategory(row, products.map(normalizeProduct));
    },

    async modifierGroups(
      _: unknown,
      args: { orgId: string; productId?: string },
      ctx: GqlContext,
    ) {
      const orgId = getOrgId(ctx);

      if (args.productId) {
        // Fetch modifier groups linked to a specific product via productModifierGroups join table
        const links = await db.query.productModifierGroups.findMany({
          where: eq(schema.productModifierGroups.productId, args.productId),
          with: { group: { with: { options: true } } },
        });

        return links.map((link) => normalizeModifierGroup(link.group));
      }

      const rows = await db.query.modifierGroups.findMany({
        where: eq(schema.modifierGroups.orgId, orgId),
        with: { options: true },
        orderBy: [desc(schema.modifierGroups.sortOrder)],
      });

      return rows.map(normalizeModifierGroup);
    },
  },

  Mutation: {
    async createProduct(
      _: unknown,
      args: {
        input: {
          name: string;
          description?: string;
          sku: string;
          barcodes?: string[];
          basePrice: number;
          categoryId?: string;
          tags?: string[];
          isActive?: boolean;
        };
      },
      ctx: GqlContext,
    ) {
      const orgId = getOrgId(ctx);

      const [created] = await db
        .insert(schema.products)
        .values({
          orgId,
          name: args.input.name,
          description: args.input.description ?? null,
          sku: args.input.sku,
          barcodes: args.input.barcodes ?? [],
          basePrice: String(args.input.basePrice),
          categoryId: args.input.categoryId ?? null,
          tags: args.input.tags ?? [],
          isActive: args.input.isActive ?? true,
        })
        .returning();

      return normalizeProduct(created! as ProductRow);
    },

    async updateProduct(
      _: unknown,
      args: {
        id: string;
        input: {
          name?: string;
          description?: string;
          basePrice?: number;
          categoryId?: string;
          tags?: string[];
          isActive?: boolean;
        };
      },
      ctx: GqlContext,
    ) {
      const orgId = getOrgId(ctx);

      const existing = await db.query.products.findFirst({
        where: and(eq(schema.products.id, args.id), eq(schema.products.orgId, orgId)),
      });
      if (!existing) throw new Error('Product not found');

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (args.input.name !== undefined) updateData.name = args.input.name;
      if (args.input.description !== undefined) updateData.description = args.input.description;
      if (args.input.basePrice !== undefined) updateData.basePrice = String(args.input.basePrice);
      if (args.input.categoryId !== undefined) updateData.categoryId = args.input.categoryId;
      if (args.input.tags !== undefined) updateData.tags = args.input.tags;
      if (args.input.isActive !== undefined) updateData.isActive = args.input.isActive;

      type ProductUpdate = typeof schema.products.$inferInsert;
      const [updated] = await db
        .update(schema.products)
        .set(updateData as unknown as ProductUpdate)
        .where(and(eq(schema.products.id, args.id), eq(schema.products.orgId, orgId)))
        .returning();

      return normalizeProduct(updated! as ProductRow);
    },

    async deleteProduct(_: unknown, args: { id: string }, ctx: GqlContext) {
      const orgId = getOrgId(ctx);

      const existing = await db.query.products.findFirst({
        where: and(eq(schema.products.id, args.id), eq(schema.products.orgId, orgId)),
      });
      if (!existing) throw new Error('Product not found');

      await db
        .update(schema.products)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(schema.products.id, args.id), eq(schema.products.orgId, orgId)));

      return true;
    },
  },
};

// ── Normalizers ─────────────────────────────────────────────────────────────

type ProductRow = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  sku: string;
  barcodes: unknown;
  basePrice: string | number;
  isActive: boolean;
  categoryId: string | null;
  category?: CategoryRow | null;
  tags: unknown;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type CategoryRow = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

type ModifierOptionRow = {
  id: string;
  name: string;
  priceAdjustment: string | number;
  isDefault: boolean;
};

type ModifierGroupRow = {
  id: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options?: ModifierOptionRow[];
};

interface NormalizedProduct {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  sku: string;
  barcodes: string[];
  basePrice: number;
  isActive: boolean;
  categoryId: string | null;
  category: NormalizedCategory | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface NormalizedCategory {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  products: NormalizedProduct[];
}

function normalizeProduct(row: ProductRow): NormalizedProduct {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    description: row.description ?? null,
    sku: row.sku,
    barcodes: Array.isArray(row.barcodes) ? (row.barcodes as string[]) : [],
    basePrice: Number(row.basePrice),
    isActive: row.isActive,
    categoryId: row.categoryId ?? null,
    category: row.category ? normalizeCategory(row.category, []) : null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

function normalizeCategory(
  row: CategoryRow,
  products: NormalizedProduct[],
): NormalizedCategory {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    description: row.description ?? null,
    parentId: row.parentId ?? null,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    products,
  };
}

function normalizeModifierGroup(row: ModifierGroupRow) {
  return {
    id: row.id,
    name: row.name,
    required: row.required,
    minSelections: row.minSelections,
    maxSelections: row.maxSelections,
    options: (row.options ?? []).map((opt) => ({
      id: opt.id,
      name: opt.name,
      priceAdjustment: Number(opt.priceAdjustment),
      isDefault: opt.isDefault,
    })),
  };
}
