import Link from 'next/link';
import { Github, Package, ArrowRight, Key, AlertTriangle, Code2, Layers } from 'lucide-react';

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const resources = [
  {
    name: 'catalog.products',
    methods: [
      { sig: 'client.catalog.products.list(params?)', returns: 'Promise<PaginatedResponse<Product>>', desc: 'List products. Filter by categoryId, search, isActive, limit, cursor.' },
      { sig: 'client.catalog.products.get(id)', returns: 'Promise<ApiResponse<Product>>', desc: 'Retrieve a single product by ID.' },
      { sig: 'client.catalog.products.create(data)', returns: 'Promise<ApiResponse<Product>>', desc: 'Create a new product.' },
      { sig: 'client.catalog.products.update(id, data)', returns: 'Promise<ApiResponse<Product>>', desc: 'Partial update a product.' },
      { sig: 'client.catalog.products.delete(id)', returns: 'Promise<void>', desc: 'Delete a product.' },
    ],
  },
  {
    name: 'catalog.categories',
    methods: [
      { sig: 'client.catalog.categories.list()', returns: 'Promise<PaginatedResponse<Category>>', desc: 'List all categories for the org.' },
      { sig: 'client.catalog.categories.get(id)', returns: 'Promise<ApiResponse<Category>>', desc: 'Retrieve a single category by ID.' },
    ],
  },
  {
    name: 'orders',
    methods: [
      { sig: 'client.orders.list(params?)', returns: 'Promise<PaginatedResponse<Order>>', desc: 'List orders. Filter by status, customerId, locationId, limit, cursor.' },
      { sig: 'client.orders.get(id)', returns: 'Promise<ApiResponse<Order>>', desc: 'Retrieve a full order with line items.' },
      { sig: 'client.orders.create(data)', returns: 'Promise<ApiResponse<Order>>', desc: 'Create a new order with line items.' },
      { sig: 'client.orders.updateStatus(id, status)', returns: 'Promise<ApiResponse<Order>>', desc: 'Transition an order to a new status.' },
    ],
  },
  {
    name: 'customers',
    methods: [
      { sig: 'client.customers.list(params?)', returns: 'Promise<PaginatedResponse<Customer>>', desc: 'List customers. Filter by search, limit, cursor.' },
      { sig: 'client.customers.get(id)', returns: 'Promise<ApiResponse<Customer>>', desc: 'Retrieve a single customer by ID.' },
      { sig: 'client.customers.create(data)', returns: 'Promise<ApiResponse<Customer>>', desc: 'Create a new customer record.' },
      { sig: 'client.customers.update(id, data)', returns: 'Promise<ApiResponse<Customer>>', desc: 'Partial update a customer.' },
    ],
  },
  {
    name: 'inventory.stock',
    methods: [
      { sig: 'client.inventory.stock.list(params?)', returns: 'Promise<PaginatedResponse<StockLevel>>', desc: 'List stock levels. Filter by locationId, lowStock, productId.' },
      { sig: 'client.inventory.stock.get(productId, locationId)', returns: 'Promise<ApiResponse<StockLevel>>', desc: 'Get stock level for a specific product at a location.' },
      { sig: 'client.inventory.stock.adjust(productId, data)', returns: 'Promise<ApiResponse<StockAdjustment>>', desc: 'Adjust inventory quantity with a reason.' },
    ],
  },
  {
    name: 'loyalty.accounts',
    methods: [
      { sig: 'client.loyalty.accounts.get(customerId)', returns: 'Promise<ApiResponse<LoyaltyAccount>>', desc: 'Get loyalty account for a customer.' },
      { sig: 'client.loyalty.accounts.transactions(accountId, params?)', returns: 'Promise<PaginatedResponse<LoyaltyTransaction>>', desc: 'List points transactions for an account.' },
      { sig: 'client.loyalty.accounts.accruePoints(accountId, data)', returns: 'Promise<ApiResponse<LoyaltyTransaction>>', desc: 'Add loyalty points to an account.' },
      { sig: 'client.loyalty.accounts.redeemPoints(accountId, data)', returns: 'Promise<ApiResponse<LoyaltyTransaction>>', desc: 'Redeem loyalty points from an account.' },
    ],
  },
  {
    name: 'webhooks',
    methods: [
      { sig: 'client.webhooks.list()', returns: 'Promise<PaginatedResponse<Webhook>>', desc: 'List all registered webhooks for the org.' },
      { sig: 'client.webhooks.create(data)', returns: 'Promise<ApiResponse<Webhook>>', desc: 'Register a new webhook endpoint. Secret returned only once.' },
      { sig: 'client.webhooks.update(id, data)', returns: 'Promise<ApiResponse<Webhook>>', desc: 'Update URL, events, label, or enabled state.' },
      { sig: 'client.webhooks.delete(id)', returns: 'Promise<void>', desc: 'Remove a webhook endpoint.' },
      { sig: 'client.webhooks.test(id)', returns: 'Promise<ApiResponse<...>>', desc: 'Send a test ping to the webhook URL.' },
      { sig: 'client.webhooks.deliveries(id, params?)', returns: 'Promise<PaginatedResponse<WebhookDelivery>>', desc: 'List recent delivery attempts with status and duration.' },
    ],
  },
];

const keyInterfaces = [
  {
    name: 'ElevatedPOSClientConfig',
    body: `interface ElevatedPOSClientConfig {
  apiKey: string;           // required — server-side only
  baseUrl?: string;         // default: https://api.elevatedpos.com.au
  timeout?: number;         // default: 30_000 ms
}`,
  },
  {
    name: 'Product',
    body: `interface Product {
  id: string; orgId: string; name: string; sku: string;
  basePrice: number; costPrice?: number; isActive: boolean;
  categoryId?: string; tags: string[]; description?: string;
  imageUrl?: string; barcode?: string; taxRate?: number;
  createdAt: string; updatedAt: string;
}`,
  },
  {
    name: 'Order',
    body: `interface Order {
  id: string; orgId: string; orderNumber: string;
  status: 'pending'|'confirmed'|'in_progress'|'ready'|'completed'|'cancelled'|'refunded';
  subtotal: number; discountTotal: number; taxTotal: number; total: number;
  customerId?: string; locationId?: string; lines: OrderLine[];
  createdAt: string; updatedAt: string;
}`,
  },
  {
    name: 'Webhook',
    body: `interface Webhook {
  id: string; orgId: string; label: string; url: string;
  events: WebhookEvent[]; enabled: boolean;
  secret?: string; // only present on creation response
  createdAt: string; updatedAt: string;
}`,
  },
  {
    name: 'ElevatedPOSApiError',
    body: `class ElevatedPOSApiError extends Error {
  status: number;   // HTTP status code (0 = network error)
  type: string;     // RFC 9457 problem type URI
  message: string;  // human-readable title
  detail?: string;  // additional detail

  get isUnauthorized(): boolean  // status === 401
  get isForbidden(): boolean     // status === 403
  get isNotFound(): boolean      // status === 404
  get isValidationError(): boolean // status === 422
  get isServerError(): boolean   // status >= 500
}`,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SdkPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center gap-3 text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-300 transition-colors">Home</Link>
        <span>/</span>
        <span className="text-gray-300">TypeScript SDK</span>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <h1 className="text-3xl font-bold text-white">TypeScript SDK</h1>
          <a
            href="https://github.com/elevatedpos/api-client"
            className="flex items-center gap-2 px-3 py-1.5 border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-gray-200 rounded-lg text-sm transition-colors"
          >
            <Github className="w-4 h-4" />
            View on GitHub
          </a>
        </div>
        <p className="text-gray-400 mb-4">
          The official ElevatedPOS client for Node.js and TypeScript. Strongly typed, zero production
          dependencies — uses the platform <code className="font-mono text-indigo-300 text-sm">fetch</code> API.
        </p>
        <div className="flex items-center gap-2 mb-10">
          <span className="text-xs px-2 py-0.5 bg-indigo-950 border border-indigo-800 text-indigo-300 rounded font-mono">npm</span>
          <span className="text-xs px-2 py-0.5 bg-emerald-950 border border-emerald-800 text-emerald-300 rounded font-mono">v1.2.0</span>
          <span className="text-xs px-2 py-0.5 bg-gray-800 border border-gray-700 text-gray-400 rounded font-mono">MIT</span>
          <span className="text-xs px-2 py-0.5 bg-gray-800 border border-gray-700 text-gray-400 rounded font-mono">ESM + CJS</span>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Installation */}
        {/* ----------------------------------------------------------------- */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-400" />
            Installation
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Package name: <code className="font-mono text-indigo-300">@elevatedpos/api-client</code>
          </p>
          <div className="space-y-3">
            {[
              { label: 'npm', cmd: 'npm install @elevatedpos/api-client' },
              { label: 'pnpm', cmd: 'pnpm add @elevatedpos/api-client' },
              { label: 'yarn', cmd: 'yarn add @elevatedpos/api-client' },
            ].map(({ label, cmd }) => (
              <div key={label} className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center gap-3">
                <span className="text-xs text-gray-600 w-10 shrink-0">{label}</span>
                <pre className="font-mono text-sm text-gray-300">{cmd}</pre>
              </div>
            ))}
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Authentication */}
        {/* ----------------------------------------------------------------- */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
            <Key className="w-5 h-5 text-indigo-400" />
            Authentication
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            The SDK supports <strong className="text-gray-300">API Key</strong> authentication for server-to-server use cases
            and <strong className="text-gray-300">OAuth 2.0</strong> for partner integrations that act on behalf of a merchant.
          </p>

          {/* API Key */}
          <h3 className="text-sm font-semibold text-gray-300 mb-2">API Key (server-side)</h3>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-4">
            <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`import { createClient } from '@elevatedpos/api-client';

const epos = createClient({
  apiKey: process.env.ELEVATEDPOS_API_KEY!,   // never expose this in the browser
  // baseUrl: 'https://sandbox.elevatedpos.com.au', // uncomment to use sandbox
});`}</pre>
          </div>

          {/* OAuth */}
          <h3 className="text-sm font-semibold text-gray-300 mb-2">OAuth 2.0 (partner apps)</h3>
          <p className="text-xs text-gray-500 mb-2">
            After completing the OAuth flow and receiving tokens, pass the access token via the standard
            Authorization header by constructing a thin wrapper. Refer to the{' '}
            <Link href="/oauth" className="text-indigo-400 hover:text-indigo-300 underline">OAuth docs</Link> for
            the full flow.
          </p>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`// OAuth: use a proxy that injects the bearer token server-side
// and call your own backend endpoints to avoid exposing the token.
// The ElevatedPOS API also accepts:  Authorization: Bearer <access_token>
// Set this at the gateway level when forwarding merchant requests.`}</pre>
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Quick Start */}
        {/* ----------------------------------------------------------------- */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
            <Code2 className="w-5 h-5 text-indigo-400" />
            Quick Start
          </h2>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`import { createClient } from '@elevatedpos/api-client';

const epos = createClient({ apiKey: process.env.ELEVATEDPOS_API_KEY! });

// List products with pagination
const { data: products, meta } = await epos.catalog.products.list({
  isActive: true,
  limit: 20,
});
console.log(\`Showing \${products.length} of \${meta.totalCount} products\`);

// Search customers
const { data: customers } = await epos.customers.list({ search: 'Jane' });

// Create an order
const { data: order } = await epos.orders.create({
  locationId: 'loc_01HXXXXXXXXXX',
  customerId: customers[0].id,
  lines: [
    { productId: products[0].id, quantity: 2, unitPrice: 4.50 },
  ],
});

console.log('Order created:', order.orderNumber, order.status);

// Adjust inventory after a manual count
await epos.inventory.stock.adjust(products[0].id, {
  locationId: 'loc_01HXXXXXXXXXX',
  quantity: -3,
  reason: 'manual_count',
});

// Accrue loyalty points
await epos.loyalty.accounts.accruePoints(customers[0].id, {
  orderId: order.id,
  points: 50,
  description: 'Purchase reward',
});`}</pre>
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Resource reference */}
        {/* ----------------------------------------------------------------- */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            Method Reference
          </h2>
          <p className="text-sm text-gray-500 mb-6">All methods are <code className="font-mono text-indigo-300 text-xs">async</code> and return typed promises. Errors throw <code className="font-mono text-indigo-300 text-xs">ElevatedPOSApiError</code>.</p>

          <div className="space-y-6">
            {resources.map((resource) => (
              <div key={resource.name}>
                <h3 className="text-sm font-mono text-indigo-400 mb-2 font-semibold">{resource.name}</h3>
                <div className="space-y-1.5">
                  {resource.methods.map((m) => (
                    <div key={m.sig} className="p-3 bg-gray-900 border border-gray-800 rounded-lg grid grid-cols-1 gap-0.5">
                      <code className="text-xs font-mono text-gray-200 leading-relaxed">
                        {m.sig}
                        <span className="text-gray-600"> → </span>
                        <span className="text-emerald-400">{m.returns}</span>
                      </code>
                      <p className="text-xs text-gray-500">{m.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Webhook verification */}
        {/* ----------------------------------------------------------------- */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-white mb-1">Webhook Verification</h2>
          <p className="text-sm text-gray-500 mb-4">
            ElevatedPOS signs every delivery with <code className="font-mono text-indigo-300 text-xs">X-ElevatedPOS-Signature: sha256=HMAC(secret, body)</code>.
            Use <code className="font-mono text-indigo-300 text-xs">verifyWebhookSignature</code> to validate incoming requests.
          </p>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
            <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`import { verifyWebhookSignature } from '@elevatedpos/api-client';

// Next.js App Router example
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-elevatedpos-signature') ?? '';

  const isValid = await verifyWebhookSignature(
    rawBody,
    signature,
    process.env.ELEVATEDPOS_WEBHOOK_SECRET!,
  );

  if (!isValid) {
    return new Response('Invalid signature', { status: 401 });
  }

  const event = JSON.parse(rawBody);
  console.log('Event type:', event.type);   // e.g. 'order.completed'
  console.log('Payload:', event.data);

  return new Response('OK', { status: 200 });
}`}</pre>
          </div>

          <h3 className="text-sm font-semibold text-gray-300 mb-2">Register a webhook</h3>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`const { data: webhook } = await epos.webhooks.create({
  url: 'https://yourapp.com/api/elevatedpos-webhook',
  events: ['order.completed', 'payment.captured', 'inventory.low_stock'],
  label: 'Production handler',
});

// IMPORTANT: save webhook.secret securely now — it is never shown again
// Store it in an environment variable or secrets manager, never log it

// Later: list deliveries for debugging
const { data: deliveries } = await epos.webhooks.deliveries(webhook.id);
deliveries.forEach((d) => {
  console.log(d.event, d.success, d.statusCode, \`\${d.durationMs}ms\`);
});`}</pre>
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Error handling */}
        {/* ----------------------------------------------------------------- */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Error Handling
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            All failed requests throw a typed <code className="font-mono text-indigo-300 text-xs">ElevatedPOSApiError</code>. Network timeouts throw with <code className="font-mono text-indigo-300 text-xs">status === 0</code>.
          </p>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`import { createClient, ElevatedPOSApiError } from '@elevatedpos/api-client';

const epos = createClient({ apiKey: process.env.ELEVATEDPOS_API_KEY! });

try {
  const { data: product } = await epos.catalog.products.get('nonexistent-id');
} catch (err) {
  if (err instanceof ElevatedPOSApiError) {
    // Strongly typed properties:
    console.error(err.status);          // 404
    console.error(err.message);         // "Not Found"
    console.error(err.detail);          // "Product not found"
    console.error(err.type);            // "https://elevatedpos.com.au/errors/not-found"

    // Convenience getters:
    if (err.isNotFound)        { /* handle 404 */ }
    if (err.isValidationError) { /* handle 422 — check err.detail */ }
    if (err.isUnauthorized)    { /* re-authenticate */ }
    if (err.isForbidden)       { /* insufficient permissions */ }
    if (err.isServerError)     { /* 5xx — retry with backoff */ }
  }
}`}</pre>
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* TypeScript types */}
        {/* ----------------------------------------------------------------- */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-white mb-1">TypeScript Types</h2>
          <p className="text-sm text-gray-500 mb-4">
            All types are exported from <code className="font-mono text-indigo-300 text-xs">@elevatedpos/api-client</code>.
          </p>
          <div className="space-y-4">
            {keyInterfaces.map(({ name, body }) => (
              <div key={name}>
                <h3 className="text-xs font-mono text-indigo-400 mb-1.5">{name}</h3>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <pre className="text-xs text-gray-300 font-mono overflow-x-auto leading-relaxed">{body}</pre>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* CTA */}
        {/* ----------------------------------------------------------------- */}
        <div className="flex items-center gap-4 p-5 bg-indigo-950 border border-indigo-900 rounded-xl">
          <Package className="w-8 h-8 text-indigo-400 shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white mb-0.5">Full source on GitHub</h3>
            <p className="text-xs text-gray-400">Issues, pull requests, and discussions welcome.</p>
          </div>
          <a
            href="https://github.com/elevatedpos/api-client"
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
          >
            View SDK <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
