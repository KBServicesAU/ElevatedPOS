export const typeDefs = `
  type Query {
    products(orgId: String!, categoryId: String, search: String, isActive: Boolean, limit: Int): [Product!]!
    product(id: ID!): Product
    categories(orgId: String!): [Category!]!
    category(id: ID!): Category
    modifierGroups(orgId: String!, productId: String): [ModifierGroup!]!
  }

  type Mutation {
    createProduct(input: CreateProductInput!): Product!
    updateProduct(id: ID!, input: UpdateProductInput!): Product!
    deleteProduct(id: ID!): Boolean!
  }

  type Product {
    id: ID!
    orgId: String!
    name: String!
    description: String
    sku: String!
    barcodes: [String!]!
    basePrice: Float!
    isActive: Boolean!
    categoryId: String
    category: Category
    tags: [String!]!
    createdAt: String!
    updatedAt: String!
  }

  type Category {
    id: ID!
    orgId: String!
    name: String!
    description: String
    parentId: String
    sortOrder: Int!
    isActive: Boolean!
    products: [Product!]!
  }

  type ModifierGroup {
    id: ID!
    name: String!
    required: Boolean!
    minSelections: Int!
    maxSelections: Int!
    options: [ModifierOption!]!
  }

  type ModifierOption {
    id: ID!
    name: String!
    priceAdjustment: Float!
    isDefault: Boolean!
  }

  input CreateProductInput {
    name: String!
    description: String
    sku: String!
    barcodes: [String!]
    basePrice: Float!
    categoryId: String
    tags: [String!]
    isActive: Boolean
  }

  input UpdateProductInput {
    name: String
    description: String
    basePrice: Float
    categoryId: String
    tags: [String!]
    isActive: Boolean
  }
`;
