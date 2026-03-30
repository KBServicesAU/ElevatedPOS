import Link from 'next/link';
import { CheckCircle2, AlertTriangle, Trash2, Plus } from 'lucide-react';

interface ChangeEntry {
  type: 'added' | 'changed' | 'deprecated' | 'removed' | 'fixed';
  text: string;
}

interface VersionEntry {
  version: string;
  date: string;
  label?: string;
  summary: string;
  changes: ChangeEntry[];
}

const CHANGE_STYLES = {
  added: { icon: Plus, color: 'text-emerald-400', badge: 'bg-emerald-900/50 text-emerald-300 border-emerald-800' },
  changed: { icon: CheckCircle2, color: 'text-blue-400', badge: 'bg-blue-900/50 text-blue-300 border-blue-800' },
  deprecated: { icon: AlertTriangle, color: 'text-amber-400', badge: 'bg-amber-900/50 text-amber-300 border-amber-800' },
  removed: { icon: Trash2, color: 'text-red-400', badge: 'bg-red-900/50 text-red-300 border-red-800' },
  fixed: { icon: CheckCircle2, color: 'text-purple-400', badge: 'bg-purple-900/50 text-purple-300 border-purple-800' },
};

const versions: VersionEntry[] = [
  {
    version: 'v1.2.0',
    date: '2024-09-15',
    label: 'Current',
    summary: 'GraphQL API for Catalog, Temporal automation engine, partner portal APIs.',
    changes: [
      { type: 'added', text: 'GraphQL endpoint at /graphql on the Catalog service — supports products, categories, and variant queries.' },
      { type: 'added', text: 'Temporal-compatible automation workflow engine with durable execution semantics.' },
      { type: 'added', text: 'Webhook retry policy: up to 5 attempts with exponential back-off.' },
      { type: 'added', text: 'Partner provisioning API: POST /api/v1/partners/tenants for reseller tenant creation.' },
      { type: 'added', text: 'inventory.transfer_completed and automation.triggered webhook events.' },
      { type: 'changed', text: 'Rate limit headers updated to X-RateLimit-Limit, X-RateLimit-Remaining for RFC compliance.' },
      { type: 'changed', text: 'OAuth token endpoint moved from /auth/oauth to /oauth/token for cleaner URL hierarchy.' },
      { type: 'fixed', text: 'Pagination cursor overflow when total results were an exact multiple of page size.' },
      { type: 'fixed', text: 'campaign.stats endpoint returning 500 for campaigns with zero redemptions.' },
    ],
  },
  {
    version: 'v1.1.0',
    date: '2024-07-01',
    summary: 'Loyalty engine, campaigns, automations, and KDS integration.',
    changes: [
      { type: 'added', text: 'Loyalty programs API: points accrual, redemption, tiers, and member lookup.' },
      { type: 'added', text: 'Campaigns API: discount rules, promotion scheduling, and voucher issuance.' },
      { type: 'added', text: 'Automations API: rule creation with trigger/condition/action pipeline.' },
      { type: 'added', text: 'POST /api/v1/automations/trigger for manual trigger testing.' },
      { type: 'added', text: 'Webhook events for loyalty (points_accrued, points_redeemed, tier_changed) and campaigns.' },
      { type: 'added', text: 'KDS (Kitchen Display System) order feed via Server-Sent Events at /api/v1/kds/stream.' },
      { type: 'changed', text: 'Customer profile schema extended with preferences, birthday, and loyalty_member_id.' },
      { type: 'changed', text: 'Order response now includes loyalty_points_earned for completed orders.' },
      { type: 'deprecated', text: 'GET /api/v1/customers/:id/rewards — use GET /api/v1/loyalty/members/:customerId instead.' },
    ],
  },
  {
    version: 'v1.0.0',
    date: '2024-04-01',
    summary: 'Initial public release of the NEXUS POS REST API.',
    changes: [
      { type: 'added', text: 'Authentication: JWT login, refresh, logout, and OAuth 2.0 Authorization Code flow.' },
      { type: 'added', text: 'Catalog API: products, variants, categories, modifiers, price lists, bundles, markdowns.' },
      { type: 'added', text: 'Inventory API: stock levels, manual adjustments, inter-location transfers, movement audit trail.' },
      { type: 'added', text: 'Orders API: order creation, status management, refunds, and order history.' },
      { type: 'added', text: 'Payments API: payment intents, capture, void, and payment method configuration.' },
      { type: 'added', text: 'Customers API: profile management, search, and order history.' },
      { type: 'added', text: 'Integrations API: webhook registration and test delivery.' },
      { type: 'added', text: 'RFC 7807 Problem Details for all error responses.' },
      { type: 'added', text: 'Per-org rate limiting at 100 req/min (Starter plan).' },
      { type: 'added', text: 'Webhook events: order.created, order.completed, payment.approved, payment.failed, inventory.low_stock, inventory.out_of_stock, customer.created.' },
    ],
  },
];

function ChangeIcon({ type }: { type: ChangeEntry['type'] }) {
  const { icon: Icon, color } = CHANGE_STYLES[type];
  return <Icon className={`w-3.5 h-3.5 ${color} flex-shrink-0 mt-0.5`} />;
}

function TypeBadge({ type }: { type: ChangeEntry['type'] }) {
  const { badge } = CHANGE_STYLES[type];
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium capitalize ${badge}`}>
      {type}
    </span>
  );
}

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center gap-3 text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-300 transition-colors">Home</Link>
        <span>/</span>
        <span className="text-gray-300">Changelog</span>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-white mb-2">API Changelog</h1>
        <p className="text-gray-400 mb-10">
          All API versions follow <a href="https://semver.org" className="text-indigo-400 hover:underline">Semantic Versioning</a>.
          Breaking changes are always announced 90 days in advance.
        </p>

        <div className="space-y-12">
          {versions.map((v) => (
            <div key={v.version} className="relative">
              {/* Version header */}
              <div className="flex items-center gap-3 mb-5">
                <h2 className="text-xl font-bold text-white font-mono">{v.version}</h2>
                {v.label && (
                  <span className="text-xs px-2 py-0.5 bg-emerald-900 border border-emerald-700 text-emerald-300 rounded-full font-semibold">
                    {v.label}
                  </span>
                )}
                <span className="text-xs text-gray-600 font-mono ml-auto">{v.date}</span>
              </div>
              <p className="text-sm text-gray-400 mb-4">{v.summary}</p>

              {/* Changes */}
              <div className="space-y-2">
                {v.changes.map((c, i) => (
                  <div key={i} className="flex gap-3 items-start p-3 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors">
                    <ChangeIcon type={c.type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-300 leading-relaxed">{c.text}</p>
                    </div>
                    <TypeBadge type={c.type} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-12 p-4 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-500">
          <p>
            For deprecation notices and migration guides, see the{' '}
            <Link href="/api-reference" className="text-indigo-400 hover:underline">API Reference</Link>.
            Subscribe to{' '}
            <Link href="/webhooks" className="text-indigo-400 hover:underline">webhooks</Link>{' '}
            to receive real-time API status updates.
          </p>
        </div>
      </div>
    </div>
  );
}
