import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-900 text-emerald-300 border-emerald-800',
  POST: 'bg-blue-900 text-blue-300 border-blue-800',
  PATCH: 'bg-amber-900 text-amber-300 border-amber-800',
  PUT: 'bg-orange-900 text-orange-300 border-orange-800',
  DELETE: 'bg-red-900 text-red-300 border-red-800',
};

interface Endpoint {
  method: string;
  path: string;
  description: string;
}

interface Section {
  id: string;
  title: string;
  endpoints: Endpoint[];
}

const sections: Section[] = [
  {
    id: 'authentication',
    title: 'Authentication',
    endpoints: [
      { method: 'POST', path: '/api/v1/auth/login', description: 'Exchange credentials for a JWT access token and refresh token' },
      { method: 'POST', path: '/api/v1/auth/refresh', description: 'Obtain a new access token using a refresh token' },
      { method: 'POST', path: '/api/v1/auth/logout', description: 'Revoke the current session tokens' },
      { method: 'GET', path: '/api/v1/auth/me', description: 'Return the authenticated user profile' },
      { method: 'POST', path: '/api/v1/oauth/token', description: 'OAuth 2.0 token exchange (authorization_code / refresh_token)' },
    ],
  },
  {
    id: 'catalog',
    title: 'Catalog',
    endpoints: [
      { method: 'GET', path: '/api/v1/products', description: 'List products for the authenticated org with pagination' },
      { method: 'POST', path: '/api/v1/products', description: 'Create a new product' },
      { method: 'GET', path: '/api/v1/products/:id', description: 'Retrieve a single product by ID' },
      { method: 'PATCH', path: '/api/v1/products/:id', description: 'Update product fields' },
      { method: 'DELETE', path: '/api/v1/products/:id', description: 'Archive (soft-delete) a product' },
      { method: 'GET', path: '/api/v1/categories', description: 'List product categories' },
      { method: 'POST', path: '/api/v1/categories', description: 'Create a category' },
      { method: 'GET', path: '/api/v1/modifiers', description: 'List modifier groups and options' },
      { method: 'POST', path: '/api/v1/price-lists', description: 'Create a price list' },
      { method: 'GET', path: '/graphql', description: 'GraphQL endpoint — products, categories, variants queries' },
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory',
    endpoints: [
      { method: 'GET', path: '/api/v1/inventory/levels', description: 'Get stock levels across locations' },
      { method: 'POST', path: '/api/v1/inventory/adjust', description: 'Manual stock adjustment with reason code' },
      { method: 'POST', path: '/api/v1/inventory/transfer', description: 'Inter-location stock transfer' },
      { method: 'GET', path: '/api/v1/inventory/movements', description: 'Audit trail of all inventory movements' },
      { method: 'GET', path: '/api/v1/inventory/alerts', description: 'List low-stock and out-of-stock alerts' },
    ],
  },
  {
    id: 'orders',
    title: 'Orders',
    endpoints: [
      { method: 'GET', path: '/api/v1/orders', description: 'List orders with filters (status, date range, location)' },
      { method: 'POST', path: '/api/v1/orders', description: 'Create a new order' },
      { method: 'GET', path: '/api/v1/orders/:id', description: 'Retrieve order with line items, payments, and history' },
      { method: 'PATCH', path: '/api/v1/orders/:id/status', description: 'Update order status (e.g., completed, voided)' },
      { method: 'POST', path: '/api/v1/orders/:id/refund', description: 'Initiate a full or partial refund' },
    ],
  },
  {
    id: 'payments',
    title: 'Payments',
    endpoints: [
      { method: 'POST', path: '/api/v1/payments', description: 'Create a payment intent for an order' },
      { method: 'GET', path: '/api/v1/payments/:id', description: 'Retrieve payment details and status' },
      { method: 'POST', path: '/api/v1/payments/:id/capture', description: 'Capture a pre-authorized payment' },
      { method: 'POST', path: '/api/v1/payments/:id/void', description: 'Void an uncaptured payment' },
      { method: 'GET', path: '/api/v1/payments/methods', description: 'List configured payment methods for the org' },
    ],
  },
  {
    id: 'customers',
    title: 'Customers',
    endpoints: [
      { method: 'GET', path: '/api/v1/customers', description: 'Search and list customers' },
      { method: 'POST', path: '/api/v1/customers', description: 'Create or upsert a customer record' },
      { method: 'GET', path: '/api/v1/customers/:id', description: 'Get customer profile with purchase history' },
      { method: 'PATCH', path: '/api/v1/customers/:id', description: 'Update customer fields and preferences' },
      { method: 'GET', path: '/api/v1/customers/:id/orders', description: 'List all orders for a customer' },
    ],
  },
  {
    id: 'loyalty',
    title: 'Loyalty',
    endpoints: [
      { method: 'GET', path: '/api/v1/loyalty/programs', description: 'List loyalty programs for the org' },
      { method: 'POST', path: '/api/v1/loyalty/programs', description: 'Create a loyalty program' },
      { method: 'POST', path: '/api/v1/loyalty/points/accrue', description: 'Manually accrue points for a customer' },
      { method: 'POST', path: '/api/v1/loyalty/points/redeem', description: 'Redeem points for a reward' },
      { method: 'GET', path: '/api/v1/loyalty/members/:customerId', description: 'Get loyalty membership and tier for a customer' },
    ],
  },
  {
    id: 'campaigns',
    title: 'Campaigns',
    endpoints: [
      { method: 'GET', path: '/api/v1/campaigns', description: 'List marketing campaigns' },
      { method: 'POST', path: '/api/v1/campaigns', description: 'Create a campaign (discount, offer, promotion)' },
      { method: 'PATCH', path: '/api/v1/campaigns/:id', description: 'Update campaign status or rules' },
      { method: 'GET', path: '/api/v1/campaigns/:id/stats', description: 'Campaign performance metrics' },
    ],
  },
  {
    id: 'automations',
    title: 'Automations',
    endpoints: [
      { method: 'GET', path: '/api/v1/automations', description: 'List automation rules for the org' },
      { method: 'POST', path: '/api/v1/automations', description: 'Create an automation rule (trigger + conditions + actions)' },
      { method: 'PATCH', path: '/api/v1/automations/:id', description: 'Update automation rule' },
      { method: 'DELETE', path: '/api/v1/automations/:id', description: 'Delete an automation rule' },
      { method: 'POST', path: '/api/v1/automations/trigger', description: 'Manually fire a trigger event for testing' },
    ],
  },
  {
    id: 'integrations',
    title: 'Integrations',
    endpoints: [
      { method: 'GET', path: '/api/v1/integrations', description: 'List installed integrations for the org' },
      { method: 'POST', path: '/api/v1/integrations', description: 'Install a new integration' },
      { method: 'GET', path: '/api/v1/integrations/:id/webhooks', description: 'List webhooks for an integration' },
      { method: 'POST', path: '/api/v1/integrations/:id/webhooks', description: 'Register a webhook endpoint' },
      { method: 'POST', path: '/api/v1/integrations/:id/webhooks/test', description: 'Send a test webhook payload' },
    ],
  },
];

const errorCodes = [
  { status: 400, title: 'Bad Request', description: 'Malformed request body or query parameters.' },
  { status: 401, title: 'Unauthorized', description: 'Missing or invalid Bearer token.' },
  { status: 403, title: 'Forbidden', description: 'Authenticated but insufficient scope or org mismatch.' },
  { status: 404, title: 'Not Found', description: 'Resource does not exist or is outside your org.' },
  { status: 422, title: 'Unprocessable Entity', description: 'Validation failed — see errors array for field details.' },
  { status: 429, title: 'Too Many Requests', description: 'Rate limit exceeded. Retry after the Retry-After header value.' },
  { status: 500, title: 'Internal Server Error', description: 'Unexpected server error. Contact support with the request ID.' },
];

function MethodBadge({ method }: { method: string }) {
  const cls = METHOD_COLORS[method] ?? 'bg-gray-800 text-gray-300 border-gray-700';
  return (
    <span className={`inline-block text-xs font-mono font-bold px-2 py-0.5 rounded border ${cls} w-16 text-center flex-shrink-0`}>
      {method}
    </span>
  );
}

export default function ApiReferencePage() {
  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 border-r border-gray-800 sticky top-0 h-screen overflow-y-auto py-6 px-4">
        <Link href="/" className="flex items-center gap-2 mb-6 px-2">
          <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center text-xs font-bold text-white">N</div>
          <span className="text-sm font-semibold text-gray-300">API Reference</span>
        </Link>
        <nav className="space-y-0.5">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-500 hover:text-gray-200 hover:bg-gray-800/50 rounded transition-colors"
            >
              <ChevronRight className="w-3 h-3" />
              {s.title}
            </a>
          ))}
          <a href="#rate-limits" className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-500 hover:text-gray-200 hover:bg-gray-800/50 rounded transition-colors">
            <ChevronRight className="w-3 h-3" />Rate Limits
          </a>
          <a href="#errors" className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-500 hover:text-gray-200 hover:bg-gray-800/50 rounded transition-colors">
            <ChevronRight className="w-3 h-3" />Error Codes
          </a>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-10">
          <h1 className="text-3xl font-bold text-white mb-2">API Reference</h1>
          <p className="text-gray-400 mb-10">
            Base URL: <code className="font-mono text-indigo-300 bg-gray-900 px-2 py-0.5 rounded text-sm">https://api.nexus.app</code>
            &nbsp;&middot;&nbsp;All endpoints require <code className="font-mono text-indigo-300 bg-gray-900 px-2 py-0.5 rounded text-sm">Authorization: Bearer &lt;token&gt;</code>
          </p>

          {/* Auth overview */}
          <section id="authentication" className="mb-12">
            <h2 className="text-xl font-bold text-white mb-1">Authentication</h2>
            <p className="text-gray-400 text-sm mb-4">
              NEXUS supports <strong className="text-gray-200">Bearer JWT</strong> for internal integrations and <strong className="text-gray-200">OAuth 2.0 (Authorization Code)</strong> for partner apps.
            </p>
            <div className="mb-6 bg-gray-900 border border-gray-800 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-2 font-mono">Authorization header</p>
              <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...`}</pre>
            </div>
            <div className="space-y-2 mb-6">
              {sections[0].endpoints.map((ep) => (
                <div key={ep.path} className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors">
                  <MethodBadge method={ep.method} />
                  <code className="text-sm font-mono text-gray-300 flex-1">{ep.path}</code>
                  <span className="text-xs text-gray-500">{ep.description}</span>
                </div>
              ))}
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-2 font-mono">POST /api/v1/auth/login — Request</p>
              <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`{
  "email": "admin@store.com",
  "password": "••••••••"
}`}</pre>
              <p className="text-xs text-gray-500 mt-4 mb-2 font-mono">Response 200</p>
              <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`{
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "expiresIn": 900,
    "user": { "id": "uuid", "email": "admin@store.com", "orgId": "uuid" }
  }
}`}</pre>
            </div>
          </section>

          {/* All other sections */}
          {sections.slice(1).map((section) => (
            <section key={section.id} id={section.id} className="mb-12">
              <h2 className="text-xl font-bold text-white mb-1">{section.title}</h2>
              <div className="space-y-2 mt-4">
                {section.endpoints.map((ep) => (
                  <div key={ep.path} className="flex items-start gap-3 p-3 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors">
                    <MethodBadge method={ep.method} />
                    <div className="flex-1 min-w-0">
                      <code className="text-sm font-mono text-gray-300 block">{ep.path}</code>
                      <p className="text-xs text-gray-500 mt-0.5">{ep.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {/* Rate limits */}
          <section id="rate-limits" className="mb-12">
            <h2 className="text-xl font-bold text-white mb-4">Rate Limits</h2>
            <p className="text-gray-400 text-sm mb-4">
              All API endpoints enforce rate limits per org. Limits vary by plan:
            </p>
            <div className="overflow-hidden rounded-lg border border-gray-800">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 border-b border-gray-800">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Plan</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Requests / minute</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Burst</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 bg-gray-950">
                  {[
                    { plan: 'Starter', rpm: '100', burst: '150' },
                    { plan: 'Growth', rpm: '500', burst: '750' },
                    { plan: 'Pro', rpm: '2,000', burst: '3,000' },
                    { plan: 'Enterprise', rpm: 'Custom', burst: 'Custom' },
                  ].map((row) => (
                    <tr key={row.plan} className="hover:bg-gray-900/50">
                      <td className="px-4 py-3 text-gray-300">{row.plan}</td>
                      <td className="px-4 py-3 text-gray-300 font-mono">{row.rpm}</td>
                      <td className="px-4 py-3 text-gray-300 font-mono">{row.burst}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Rate limit headers: <code className="font-mono text-gray-400">X-RateLimit-Limit</code>, <code className="font-mono text-gray-400">X-RateLimit-Remaining</code>, <code className="font-mono text-gray-400">Retry-After</code>
            </p>
          </section>

          {/* Error codes */}
          <section id="errors" className="mb-12">
            <h2 className="text-xl font-bold text-white mb-4">Error Codes (RFC 7807)</h2>
            <p className="text-gray-400 text-sm mb-4">
              All errors follow the <a href="https://www.rfc-editor.org/rfc/rfc7807" className="text-indigo-400 hover:underline">RFC 7807 Problem Details</a> format:
            </p>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
              <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`{
  "type": "https://nexus.app/errors/validation",
  "title": "Validation Error",
  "status": 422,
  "detail": "sku is required",
  "instance": "/api/v1/products"
}`}</pre>
            </div>
            <div className="space-y-2">
              {errorCodes.map((e) => (
                <div key={e.status} className="flex items-start gap-4 p-3 bg-gray-900 border border-gray-800 rounded-lg">
                  <span className={`text-sm font-mono font-bold flex-shrink-0 w-10 ${e.status >= 500 ? 'text-red-400' : e.status >= 400 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {e.status}
                  </span>
                  <div>
                    <p className="text-sm text-gray-300 font-medium">{e.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{e.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
