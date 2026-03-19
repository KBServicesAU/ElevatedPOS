import {
  pgTable, uuid, text, varchar, boolean, timestamp, jsonb,
  decimal, integer, pgEnum,
} from 'drizzle-orm/pg-core';

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
