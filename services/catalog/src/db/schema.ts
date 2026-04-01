import {
  pgTable, uuid, text, varchar, boolean, timestamp, jsonb,
  decimal, integer, pgEnum, numeric, unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const bundleTypeEnum = pgEnum('bundle_type', ['fixed', 'dynamic']);
export const bundleDiscountTypeEnum = pgEnum('bundle_discount_type', ['none', 'percentage', 'fixed']);
export const markdownScopeEnum = pgEnum('markdown_scope', ['product', 'category', 'all']);
export const markdownDiscountTypeEnum = pgEnum('markdown_discount_type', ['percentage', 'fixed']);

export const productTypeEnum = pgEnum('product_type', ['standard', 'variant', 'kit', 'service']);

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  parentId: uuid('parent_id'),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const taxClasses = pgTable('tax_classes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  rate: decimal('rate', { precision: 8, scale: 4 }).notNull(),
  isInclusive: boolean('is_inclusive').notNull().default(true),
  isDefault: boolean('is_default').notNull().default(false),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  brandId: uuid('brand_id'),
  categoryId: uuid('category_id').references(() => categories.id),
  taxClassId: uuid('tax_class_id').references(() => taxClasses.id),
  productType: productTypeEnum('product_type').notNull().default('standard'),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  sku: varchar('sku', { length: 100 }).notNull(),
  barcodes: jsonb('barcodes').notNull().default([]),
  unitOfMeasure: varchar('unit_of_measure', { length: 50 }).default('each'),
  basePrice: decimal('base_price', { precision: 12, scale: 4 }).notNull().default('0'),
  costPrice: decimal('cost_price', { precision: 12, scale: 4 }).notNull().default('0'),
  images: jsonb('images').notNull().default([]),
  tags: jsonb('tags').notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  isSoldOnline: boolean('is_sold_online').notNull().default(false),
  isSoldInstore: boolean('is_sold_instore').notNull().default(true),
  trackStock: boolean('track_stock').notNull().default(true),
  reorderPoint: integer('reorder_point').notNull().default(0),
  reorderQuantity: integer('reorder_quantity').notNull().default(0),
  weightBased: boolean('weight_based').notNull().default(false),
  weightUnit: varchar('weight_unit', { length: 20 }),
  ageRestricted: boolean('age_restricted').notNull().default(false),
  ageRestrictionMinimum: integer('age_restriction_minimum'),
  hospitalityCourse: varchar('hospitality_course', { length: 50 }),
  pluCode: varchar('plu_code', { length: 20 }),
  notes: text('notes'),
  // Channel availability
  channels: text('channels').array().notNull().default(['pos']),
  // Values: 'pos', 'web' — product shows on POS, web store, or both

  // Web storefront fields
  webSlug: varchar('web_slug', { length: 255 }),       // URL slug e.g. "flat-white-coffee"
  webDescription: text('web_description'),              // Rich text description for web
  webImages: jsonb('web_images').notNull().default([]), // Additional web images [{url, alt}]
  webFeatured: boolean('web_featured').notNull().default(false), // Feature on storefront homepage
  webSortOrder: integer('web_sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const productVariants = pgTable('product_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  sku: varchar('sku', { length: 100 }).notNull(),
  barcode: varchar('barcode', { length: 100 }),
  attributes: jsonb('attributes').notNull().default({}),
  priceOverride: decimal('price_override', { precision: 12, scale: 4 }),
  costPriceOverride: decimal('cost_price_override', { precision: 12, scale: 4 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const modifierGroups = pgTable('modifier_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  selectionType: varchar('selection_type', { length: 20 }).notNull().default('single'),
  required: boolean('required').notNull().default(false),
  minSelections: integer('min_selections').notNull().default(0),
  maxSelections: integer('max_selections').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const modifierOptions = pgTable('modifier_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').notNull().references(() => modifierGroups.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  priceAdjustment: decimal('price_adjustment', { precision: 12, scale: 4 }).notNull().default('0'),
  isDefault: boolean('is_default').notNull().default(false),
  isAvailable: boolean('is_available').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const productModifierGroups = pgTable('product_modifier_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').notNull().references(() => modifierGroups.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const priceLists = pgTable('price_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('AUD'),
  isDefault: boolean('is_default').notNull().default(false),
  channels: jsonb('channels').notNull().default([]),
  locationIds: jsonb('location_ids').notNull().default([]),
  startAt: timestamp('start_at', { withTimezone: true }),
  endAt: timestamp('end_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const priceListEntries = pgTable('price_list_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  priceListId: uuid('price_list_id').notNull().references(() => priceLists.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id'),
  price: decimal('price', { precision: 12, scale: 4 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const productBundles = pgTable('product_bundles', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  productId: uuid('product_id').notNull().references(() => products.id),
  bundleType: bundleTypeEnum('bundle_type').notNull().default('fixed'),
  name: text('name').notNull(),
  description: text('description'),
  fixedPrice: decimal('fixed_price', { precision: 12, scale: 4 }),
  discountType: bundleDiscountTypeEnum('discount_type').notNull().default('none'),
  discountValue: decimal('discount_value', { precision: 12, scale: 4 }).notNull().default('0'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bundleComponents = pgTable('bundle_components', {
  id: uuid('id').primaryKey().defaultRandom(),
  bundleId: uuid('bundle_id').notNull().references(() => productBundles.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  variantId: uuid('variant_id'),
  quantity: decimal('quantity', { precision: 12, scale: 3 }).notNull().default('1'),
  isRequired: boolean('is_required').notNull().default(true),
  allowSubstitutes: boolean('allow_substitutes').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const markdowns = pgTable('markdowns', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: text('name').notNull(),
  scope: markdownScopeEnum('scope').notNull(),
  targetId: uuid('target_id'),
  discountType: markdownDiscountTypeEnum('discount_type').notNull(),
  discountValue: decimal('discount_value', { precision: 12, scale: 4 }).notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  isClearance: boolean('is_clearance').notNull().default(false),
  appliedCount: integer('applied_count').notNull().default(0),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Recipes & Ingredient Tracking ─────────────────────────────────────────────

export const wastageReasonEnum = pgEnum('wastage_reason', ['over_production', 'spoilage', 'damage', 'expiry', 'other']);

export const recipes = pgTable('recipes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  yieldQuantity: numeric('yield_quantity', { precision: 12, scale: 3 }).notNull().default('1'),
  yieldUnit: text('yield_unit').notNull().default('portion'),
  prepTimeMinutes: integer('prep_time_minutes'),
  cookTimeMinutes: integer('cook_time_minutes'),
  instructions: text('instructions'),
  costPerYield: numeric('cost_per_yield', { precision: 12, scale: 4 }),
  costCalculatedAt: timestamp('cost_calculated_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const recipeIngredients = pgTable('recipe_ingredients', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  stockItemRef: text('stock_item_ref').notNull(), // cross-service reference by name
  ingredientName: text('ingredient_name').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  unit: text('unit').notNull(),
  wastagePercent: numeric('wastage_percent', { precision: 8, scale: 4 }).notNull().default('0'),
  estimatedCostPerUnit: numeric('estimated_cost_per_unit', { precision: 12, scale: 4 }),
  notes: text('notes'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const wastageEvents = pgTable('wastage_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  locationId: uuid('location_id').notNull(),
  productId: uuid('product_id').references(() => products.id),
  recipeId: uuid('recipe_id').references(() => recipes.id),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  unit: text('unit').notNull(),
  reason: wastageReasonEnum('reason').notNull(),
  estimatedCost: numeric('estimated_cost', { precision: 12, scale: 4 }),
  recordedBy: uuid('recorded_by').notNull(),
  notes: text('notes'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Ingredient Stock Tracking ──────────────────────────────────────────────────

export const ingredientUnitEnum = pgEnum('ingredient_unit', ['kg', 'g', 'L', 'mL', 'each']);

export const ingredients = pgTable('ingredients', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: text('name').notNull(),
  unit: ingredientUnitEnum('unit').notNull(),
  costPerUnit: decimal('cost_per_unit', { precision: 12, scale: 4 }).notNull().default('0'),
  currentStock: decimal('current_stock', { precision: 12, scale: 3 }).notNull().default('0'),
  reorderPoint: decimal('reorder_point', { precision: 12, scale: 3 }).notNull().default('0'),
  supplierId: text('supplier_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const productRecipes = pgTable(
  'product_recipes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'cascade' }),
    quantity: decimal('quantity', { precision: 12, scale: 4 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqProductIngredient: unique().on(t.productId, t.ingredientId),
  }),
);

// ── Drizzle ORM Relations ──────────────────────────────────────────────────────

export const recipesRelations = relations(recipes, ({ many }) => ({
  ingredients: many(recipeIngredients),
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeIngredients.recipeId], references: [recipes.id] }),
}));

export const ingredientsRelations = relations(ingredients, ({ many }) => ({
  productRecipes: many(productRecipes),
}));

export const productRecipesRelations = relations(productRecipes, ({ one }) => ({
  product: one(products, { fields: [productRecipes.productId], references: [products.id] }),
  ingredient: one(ingredients, { fields: [productRecipes.ingredientId], references: [ingredients.id] }),
}));
