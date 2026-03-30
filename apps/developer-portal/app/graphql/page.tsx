import Link from 'next/link';
import { ArrowLeft, ArrowRight, Layers, Zap, Lock, Terminal } from 'lucide-react';

export const metadata = {
  title: 'GraphQL API — NEXUS Developer Platform',
  description: 'Query the NEXUS catalog with the GraphQL API. Flexible, typed, and documented.',
};

const queryExamples = [
  {
    title: 'List products',
    description: 'Fetch active products in a category with only the fields you need.',
    code: `query ListProducts {
  products(
    orgId: "org_abc123"
    categoryId: "cat_xyz"
    isActive: true
    limit: 20
  ) {
    id
    name
    sku
    basePrice
    isActive
    category {
      id
      name
    }
    tags
  }
}`,
  },
  {
    title: 'Get single product',
    description: 'Fetch a product by ID including its category.',
    code: `query GetProduct {
  product(id: "prod_abc123") {
    id
    name
    description
    sku
    barcodes
    basePrice
    isActive
    categoryId
    category {
      id
      name
      sortOrder
    }
    tags
    createdAt
    updatedAt
  }
}`,
  },
  {
    title: 'List categories with products',
    description: 'Fetch all categories and their associated products in one round trip.',
    code: `query CategoriesWithProducts {
  categories(orgId: "org_abc123") {
    id
    name
    description
    parentId
    sortOrder
    isActive
    products {
      id
      name
      basePrice
      isActive
    }
  }
}`,
  },
  {
    title: 'Modifier groups for a product',
    description: 'Fetch modifier groups and all options linked to a specific product.',
    code: `query ProductModifiers {
  modifierGroups(
    orgId: "org_abc123"
    productId: "prod_abc123"
  ) {
    id
    name
    required
    minSelections
    maxSelections
    options {
      id
      name
      priceAdjustment
      isDefault
    }
  }
}`,
  },
];

const mutationExamples = [
  {
    title: 'Create a product',
    description: 'Create a new product in the catalog.',
    code: `mutation CreateProduct {
  createProduct(input: {
    name: "Flat White"
    description: "House blend with steamed milk"
    sku: "BVRG-FW-001"
    barcodes: ["9300675024042"]
    basePrice: 5.50
    categoryId: "cat_beverages"
    tags: ["coffee", "hot", "popular"]
    isActive: true
  }) {
    id
    name
    sku
    basePrice
    createdAt
  }
}`,
  },
  {
    title: 'Update a product',
    description: 'Update specific fields on an existing product.',
    code: `mutation UpdateProduct {
  updateProduct(
    id: "prod_abc123"
    input: {
      basePrice: 6.00
      isActive: false
      tags: ["coffee", "hot", "seasonal"]
    }
  ) {
    id
    name
    basePrice
    isActive
    updatedAt
  }
}`,
  },
  {
    title: 'Delete (deactivate) a product',
    description: 'Soft-deletes a product by setting isActive to false.',
    code: `mutation DeleteProduct {
  deleteProduct(id: "prod_abc123")
}`,
  },
];

const schemaTypes = [
  {
    name: 'Product',
    fields: [
      { name: 'id', type: 'ID!' },
      { name: 'orgId', type: 'String!' },
      { name: 'name', type: 'String!' },
      { name: 'description', type: 'String' },
      { name: 'sku', type: 'String!' },
      { name: 'barcodes', type: '[String!]!' },
      { name: 'basePrice', type: 'Float!' },
      { name: 'isActive', type: 'Boolean!' },
      { name: 'categoryId', type: 'String' },
      { name: 'category', type: 'Category' },
      { name: 'tags', type: '[String!]!' },
      { name: 'createdAt', type: 'String!' },
      { name: 'updatedAt', type: 'String!' },
    ],
  },
  {
    name: 'Category',
    fields: [
      { name: 'id', type: 'ID!' },
      { name: 'orgId', type: 'String!' },
      { name: 'name', type: 'String!' },
      { name: 'description', type: 'String' },
      { name: 'parentId', type: 'String' },
      { name: 'sortOrder', type: 'Int!' },
      { name: 'isActive', type: 'Boolean!' },
      { name: 'products', type: '[Product!]!' },
    ],
  },
  {
    name: 'ModifierGroup',
    fields: [
      { name: 'id', type: 'ID!' },
      { name: 'name', type: 'String!' },
      { name: 'required', type: 'Boolean!' },
      { name: 'minSelections', type: 'Int!' },
      { name: 'maxSelections', type: 'Int!' },
      { name: 'options', type: '[ModifierOption!]!' },
    ],
  },
  {
    name: 'ModifierOption',
    fields: [
      { name: 'id', type: 'ID!' },
      { name: 'name', type: 'String!' },
      { name: 'priceAdjustment', type: 'Float!' },
      { name: 'isDefault', type: 'Boolean!' },
    ],
  },
];

export default function GraphQLPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-300">
      {/* Top nav */}
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between sticky top-0 bg-gray-950/95 backdrop-blur z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-indigo-600 rounded flex items-center justify-center text-xs font-bold text-white">
            N
          </div>
          <span className="text-sm font-semibold text-gray-200">NEXUS</span>
          <span className="text-gray-600">/</span>
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-200 transition-colors">
            Developers
          </Link>
          <span className="text-gray-600">/</span>
          <span className="text-sm text-indigo-400">GraphQL</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Docs
          </Link>
          <Link
            href="/sandbox"
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium transition-colors"
          >
            Open Playground
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-12">

        {/* Hero */}
        <div className="mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-pink-950/60 border border-pink-800/50 rounded-full text-xs text-pink-300 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />
            Available from API v1.2.0
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">GraphQL API</h1>
          <p className="text-lg text-gray-400 max-w-2xl leading-relaxed">
            The NEXUS catalog is available as a GraphQL API alongside the REST endpoints.
            Query exactly the fields you need, batch related data in a single request, and explore the
            schema interactively in the playground.
          </p>

          {/* Endpoint callout */}
          <div className="mt-6 flex items-center gap-3 px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg w-fit">
            <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">Endpoint</span>
            <code className="text-sm font-mono text-indigo-300">POST https://api.nexus.app/catalog/graphql</code>
          </div>
        </div>

        {/* REST vs GraphQL */}
        <section className="mb-14">
          <h2 className="text-xl font-semibold text-white mb-4">GraphQL vs REST</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: Layers,
                color: 'text-indigo-400',
                bg: 'bg-indigo-950/40',
                border: 'border-indigo-900/50',
                title: 'Precise field selection',
                body: 'Only receive the fields you ask for — no over-fetching. Reduces payload size and speeds up client rendering.',
              },
              {
                icon: Zap,
                color: 'text-amber-400',
                bg: 'bg-amber-950/40',
                border: 'border-amber-900/50',
                title: 'Batched queries',
                body: 'Fetch products, categories, and modifier groups in a single HTTP request instead of three separate REST calls.',
              },
              {
                icon: Terminal,
                color: 'text-emerald-400',
                bg: 'bg-emerald-950/40',
                border: 'border-emerald-900/50',
                title: 'Schema-driven',
                body: 'The schema is the contract. Introspect it for type safety, auto-complete, and documentation without reading a spec doc.',
              },
            ].map(({ icon: Icon, color, bg, border, title, body }) => (
              <div key={title} className={`p-5 ${bg} border ${border} rounded-xl`}>
                <Icon className={`w-5 h-5 ${color} mb-3`} />
                <h3 className="text-sm font-semibold text-gray-100 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Authentication */}
        <section className="mb-14">
          <h2 className="text-xl font-semibold text-white mb-4">Authentication</h2>
          <div className="flex gap-3 p-4 bg-amber-950/30 border border-amber-800/40 rounded-lg mb-5">
            <Lock className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-200/80 leading-relaxed">
              All GraphQL requests must include a valid JWT issued by the NEXUS Auth service.
              Pass it as an <code className="text-amber-300 font-mono">Authorization</code> header.
              Queries are automatically scoped to the <code className="text-amber-300 font-mono">orgId</code> embedded in the token —
              you cannot access another organisation&apos;s data.
            </p>
          </div>
          <pre className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-sm overflow-x-auto">
            <code>
              <span className="text-gray-500"># Send your JWT with every request</span>{'\n'}
              <span className="text-emerald-400">POST</span>
              <span className="text-gray-300"> /catalog/graphql</span>{'\n'}
              <span className="text-sky-400">Authorization</span>
              <span className="text-gray-300">: </span>
              <span className="text-amber-300">Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...</span>{'\n'}
              <span className="text-sky-400">Content-Type</span>
              <span className="text-gray-300">: </span>
              <span className="text-amber-300">application/json</span>{'\n\n'}
              <span className="text-gray-300">{'{'}</span>{'\n'}
              <span className="text-gray-300">{'  '}</span>
              <span className="text-sky-400">&quot;query&quot;</span>
              <span className="text-gray-300">: </span>
              <span className="text-amber-300">&quot;{ products(orgId: \&quot;org_abc\&quot;) { id name } }&quot;</span>{'\n'}
              <span className="text-gray-300">{'}'}</span>
            </code>
          </pre>
        </section>

        {/* Schema explorer */}
        <section className="mb-14">
          <h2 className="text-xl font-semibold text-white mb-2">Schema Reference</h2>
          <p className="text-sm text-gray-500 mb-6">
            The types below represent the full set of fields available through the GraphQL API.
            Non-null fields are marked with <code className="text-gray-400 font-mono">!</code>.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {schemaTypes.map(({ name, fields }) => (
              <div key={name} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-800/60 border-b border-gray-700/60">
                  <span className="text-xs font-mono text-gray-500">type </span>
                  <span className="text-sm font-mono font-semibold text-indigo-300">{name}</span>
                </div>
                <div className="p-4 space-y-1.5">
                  {fields.map(({ name: field, type }) => (
                    <div key={field} className="flex items-center justify-between text-sm font-mono">
                      <span className="text-gray-300">{field}</span>
                      <span className={type.endsWith('!') ? 'text-pink-400' : 'text-gray-500'}>{type}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Input types inline */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-800/60 border-b border-gray-700/60">
                <span className="text-xs font-mono text-gray-500">input </span>
                <span className="text-sm font-mono font-semibold text-amber-300">CreateProductInput</span>
              </div>
              <div className="p-4 space-y-1.5 text-sm font-mono">
                {[
                  ['name', 'String!'],
                  ['description', 'String'],
                  ['sku', 'String!'],
                  ['barcodes', '[String!]'],
                  ['basePrice', 'Float!'],
                  ['categoryId', 'String'],
                  ['tags', '[String!]'],
                  ['isActive', 'Boolean'],
                ].map(([f, t]) => (
                  <div key={f} className="flex items-center justify-between">
                    <span className="text-gray-300">{f}</span>
                    <span className={t.endsWith('!') ? 'text-pink-400' : 'text-gray-500'}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-800/60 border-b border-gray-700/60">
                <span className="text-xs font-mono text-gray-500">input </span>
                <span className="text-sm font-mono font-semibold text-amber-300">UpdateProductInput</span>
              </div>
              <div className="p-4 space-y-1.5 text-sm font-mono">
                {[
                  ['name', 'String'],
                  ['description', 'String'],
                  ['basePrice', 'Float'],
                  ['categoryId', 'String'],
                  ['tags', '[String!]'],
                  ['isActive', 'Boolean'],
                ].map(([f, t]) => (
                  <div key={f} className="flex items-center justify-between">
                    <span className="text-gray-300">{f}</span>
                    <span className="text-gray-500">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Query examples */}
        <section className="mb-14">
          <h2 className="text-xl font-semibold text-white mb-6">Query Examples</h2>
          <div className="space-y-6">
            {queryExamples.map(({ title, description, code }) => (
              <div key={title} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                  <h3 className="text-sm font-semibold text-gray-100 mb-0.5">{title}</h3>
                  <p className="text-xs text-gray-500">{description}</p>
                </div>
                <pre className="p-5 text-sm overflow-x-auto leading-relaxed">
                  <code>
                    {code.split('\n').map((line, i) => {
                      // Keyword colouring
                      const styled = line
                        .replace(/^(query|mutation)/, (m) => `\x00keyword\x00${m}\x00end\x00`)
                        .replace(/([a-zA-Z_][a-zA-Z0-9_]*)(\s*\()/g, (_, fn, paren) => `\x00fn\x00${fn}\x00end\x00${paren}`)
                        .replace(/("[^"]*")/g, (m) => `\x00str\x00${m}\x00end\x00`)
                        .replace(/(true|false)/g, (m) => `\x00bool\x00${m}\x00end\x00`)
                        .replace(/(\d+)/g, (m) => `\x00num\x00${m}\x00end\x00`);

                      const parts = styled.split('\x00');
                      return (
                        <span key={i}>
                          {parts.map((part, j) => {
                            if (j > 0 && parts[j - 1] === 'keyword') return <span key={j} className="text-sky-400">{part}</span>;
                            if (j > 0 && parts[j - 1] === 'fn') return <span key={j} className="text-indigo-300">{part}</span>;
                            if (j > 0 && parts[j - 1] === 'str') return <span key={j} className="text-amber-300">{part}</span>;
                            if (j > 0 && parts[j - 1] === 'bool') return <span key={j} className="text-pink-400">{part}</span>;
                            if (j > 0 && parts[j - 1] === 'num') return <span key={j} className="text-emerald-400">{part}</span>;
                            if (part === 'end') return null;
                            if (['keyword', 'fn', 'str', 'bool', 'num'].includes(part)) return null;
                            return <span key={j} className="text-gray-300">{part}</span>;
                          })}
                          {'\n'}
                        </span>
                      );
                    })}
                  </code>
                </pre>
              </div>
            ))}
          </div>
        </section>

        {/* Mutation examples */}
        <section className="mb-14">
          <h2 className="text-xl font-semibold text-white mb-6">Mutation Examples</h2>
          <div className="space-y-6">
            {mutationExamples.map(({ title, description, code }) => (
              <div key={title} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="px-1.5 py-0.5 bg-rose-900/50 border border-rose-700/50 rounded text-xs font-mono text-rose-300">
                      mutation
                    </span>
                    <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
                  </div>
                  <p className="text-xs text-gray-500">{description}</p>
                </div>
                <pre className="p-5 text-sm overflow-x-auto leading-relaxed">
                  <code className="text-gray-300 font-mono whitespace-pre">{code}</code>
                </pre>
              </div>
            ))}
          </div>
        </section>

        {/* Interactive playground teaser */}
        <section className="mb-14">
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-950/60 to-gray-900 border border-indigo-800/40 rounded-2xl p-8">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="relative">
              <Terminal className="w-8 h-8 text-indigo-400 mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Interactive Playground</h2>
              <p className="text-sm text-gray-400 mb-6 max-w-lg leading-relaxed">
                Explore the full schema, write queries with autocomplete, and test mutations
                against your sandbox org — all without writing a line of code.
                The playground is powered by GraphiQL and available when the service runs in
                non-production mode.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/sandbox"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors text-sm"
                >
                  Open Sandbox Playground <ArrowRight className="w-4 h-4" />
                </Link>
                <a
                  href="http://localhost:4002/graphql"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white font-semibold rounded-lg transition-colors text-sm"
                >
                  Local GraphiQL (localhost:4002)
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Error format */}
        <section className="mb-14">
          <h2 className="text-xl font-semibold text-white mb-4">Error Format</h2>
          <p className="text-sm text-gray-500 mb-4 leading-relaxed">
            Errors follow the standard GraphQL error envelope. Check the{' '}
            <code className="text-gray-300 font-mono">errors</code> array for field-level detail.
          </p>
          <pre className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-sm overflow-x-auto">
            <code>
              <span className="text-gray-300">{'{'}</span>{'\n'}
              <span className="text-gray-300">{'  '}</span>
              <span className="text-sky-400">&quot;data&quot;</span>
              <span className="text-gray-300">: </span>
              <span className="text-gray-500">null</span>
              <span className="text-gray-300">,</span>{'\n'}
              <span className="text-gray-300">{'  '}</span>
              <span className="text-sky-400">&quot;errors&quot;</span>
              <span className="text-gray-300">: [{'{'}</span>{'\n'}
              <span className="text-gray-300">{'    '}</span>
              <span className="text-sky-400">&quot;message&quot;</span>
              <span className="text-gray-300">: </span>
              <span className="text-amber-300">&quot;Unauthorized: missing orgId in token&quot;</span>
              <span className="text-gray-300">,</span>{'\n'}
              <span className="text-gray-300">{'    '}</span>
              <span className="text-sky-400">&quot;locations&quot;</span>
              <span className="text-gray-300">: [{'{'} </span>
              <span className="text-sky-400">&quot;line&quot;</span>
              <span className="text-gray-300">: </span>
              <span className="text-emerald-400">2</span>
              <span className="text-gray-300">, </span>
              <span className="text-sky-400">&quot;column&quot;</span>
              <span className="text-gray-300">: </span>
              <span className="text-emerald-400">3</span>
              <span className="text-gray-300"> {'}'}],</span>{'\n'}
              <span className="text-gray-300">{'    '}</span>
              <span className="text-sky-400">&quot;path&quot;</span>
              <span className="text-gray-300">: [</span>
              <span className="text-amber-300">&quot;products&quot;</span>
              <span className="text-gray-300">]</span>{'\n'}
              <span className="text-gray-300">{'  '}{'}'} ]</span>{'\n'}
              <span className="text-gray-300">{'}'}</span>
            </code>
          </pre>
        </section>

        {/* Footer nav */}
        <div className="flex items-center justify-between pt-8 border-t border-gray-800">
          <Link
            href="/api-reference"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            REST API Reference
          </Link>
          <Link
            href="/webhooks"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Webhooks
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      <footer className="border-t border-gray-800 px-6 py-6 text-center text-xs text-gray-600 mt-8">
        © 2024 NEXUS POS. Developer Platform — API v1.2.0
      </footer>
    </div>
  );
}
