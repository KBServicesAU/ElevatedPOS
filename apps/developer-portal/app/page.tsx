import Link from 'next/link';
import {
  BookOpen,
  FlaskConical,
  KeyRound,
  Webhook,
  Package,
  ScrollText,
  ArrowRight,
  Zap,
  Shield,
  Globe,
  Layers,
} from 'lucide-react';

const navCards = [
  {
    href: '/api-reference',
    icon: BookOpen,
    title: 'API Reference',
    description: 'Complete REST API documentation for all ElevatedPOS services with request/response examples.',
    color: 'text-indigo-400',
    border: 'border-indigo-900/50 hover:border-indigo-700',
  },
  {
    href: '/sandbox',
    icon: FlaskConical,
    title: 'Sandbox',
    description: 'Test your integrations in an isolated environment with mock data and credentials.',
    color: 'text-emerald-400',
    border: 'border-emerald-900/50 hover:border-emerald-700',
  },
  {
    href: '/oauth',
    icon: KeyRound,
    title: 'OAuth Apps',
    description: 'Register OAuth 2.0 applications to access the ElevatedPOS API on behalf of merchants.',
    color: 'text-amber-400',
    border: 'border-amber-900/50 hover:border-amber-700',
  },
  {
    href: '/webhooks',
    icon: Webhook,
    title: 'Webhooks',
    description: 'Subscribe to real-time events from the ElevatedPOS platform using HMAC-signed webhooks.',
    color: 'text-purple-400',
    border: 'border-purple-900/50 hover:border-purple-700',
  },
  {
    href: '/sdk',
    icon: Package,
    title: 'SDK',
    description: 'Official TypeScript/Node.js SDK for rapid integration development.',
    color: 'text-sky-400',
    border: 'border-sky-900/50 hover:border-sky-700',
  },
  {
    href: '/changelog',
    icon: ScrollText,
    title: 'Changelog',
    description: 'API version history, breaking changes, and deprecation notices.',
    color: 'text-rose-400',
    border: 'border-rose-900/50 hover:border-rose-700',
  },
  {
    href: '/graphql',
    icon: Layers,
    title: 'GraphQL API',
    description: 'Query catalog products, categories, and modifiers with the flexible GraphQL endpoint.',
    color: 'text-pink-400',
    border: 'border-pink-900/50 hover:border-pink-700',
  },
];

const features = [
  { icon: Zap, title: 'Fast & Reliable', description: 'Sub-50ms median response times with 99.9% uptime SLA.' },
  { icon: Shield, title: 'Secure by Default', description: 'JWT + OAuth 2.0 auth, HMAC webhook signatures, RFC 7807 errors.' },
  { icon: Globe, title: 'Multi-tenant Ready', description: 'Every endpoint is org-scoped. Build once, sell to thousands.' },
];

export default function DevPortalHome() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Top nav */}
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-indigo-600 rounded flex items-center justify-center text-xs font-bold text-white">N</div>
          <span className="text-sm font-semibold text-gray-200">ElevatedPOS</span>
          <span className="text-gray-600">/</span>
          <span className="text-sm text-gray-400">Developers</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-gray-400">
          <Link href="/api-reference" className="hover:text-gray-200 transition-colors">Docs</Link>
          <Link href="/changelog" className="hover:text-gray-200 transition-colors">Changelog</Link>
          <a href="https://github.com/elevatedpos" className="hover:text-gray-200 transition-colors">GitHub</a>
          <Link
            href="/sandbox"
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium transition-colors"
          >
            Get Sandbox Access
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-950 border border-indigo-800 rounded-full text-xs text-indigo-300 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          API v1.2.0 — Now with GraphQL for Catalog
        </div>
        <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">
          ElevatedPOS Developer Platform
        </h1>
        <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
          Build integrations that operators love. Access inventory, orders, payments, loyalty, and more through a unified REST + GraphQL API.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/api-reference"
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors"
          >
            Get Started <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/sandbox"
            className="inline-flex items-center gap-2 px-6 py-3 border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold rounded-lg transition-colors"
          >
            Try Sandbox
          </Link>
        </div>

        {/* Quick code preview */}
        <div className="mt-12 text-left max-w-xl mx-auto">
          <pre className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-sm overflow-x-auto">
            <code className="text-gray-300 font-mono">
              <span className="text-gray-500"># Install the SDK</span>{'\n'}
              <span className="text-emerald-400">npm</span>
              <span className="text-gray-300"> install </span>
              <span className="text-amber-300">@nexus/sdk</span>
              {'\n\n'}
              <span className="text-gray-500">// Initialize and list products</span>{'\n'}
              <span className="text-sky-400">import</span>
              <span className="text-gray-300">{' { createClient } '}</span>
              <span className="text-sky-400">from</span>
              <span className="text-amber-300"> &apos;@nexus/sdk&apos;</span>
              {'\n'}
              <span className="text-sky-400">const</span>
              <span className="text-gray-300"> client = createClient({'{'} apiKey: </span>
              <span className="text-amber-300">&apos;sk_sandbox_...&apos;</span>
              <span className="text-gray-300"> {'}'})</span>
              {'\n'}
              <span className="text-sky-400">const</span>
              <span className="text-gray-300"> products = </span>
              <span className="text-sky-400">await</span>
              <span className="text-gray-300"> client.catalog.products.list()</span>
            </code>
          </pre>
        </div>
      </div>

      {/* Nav cards */}
      <div className="max-w-6xl mx-auto px-6 pb-16">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-6">Explore the Platform</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {navCards.map(({ href, icon: Icon, title, description, color, border }) => (
            <Link
              key={href}
              href={href}
              className={`group block p-6 bg-gray-900 border ${border} rounded-xl transition-all duration-200 hover:bg-gray-800/50`}
            >
              <Icon className={`w-6 h-6 ${color} mb-3`} />
              <h3 className="text-base font-semibold text-gray-100 mb-1 group-hover:text-white transition-colors">{title}</h3>
              <p className="text-sm text-gray-500 group-hover:text-gray-400 transition-colors leading-relaxed">{description}</p>
              <div className={`mt-3 flex items-center gap-1 text-xs ${color} opacity-0 group-hover:opacity-100 transition-opacity`}>
                Open <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="border-t border-gray-800 bg-gray-900/30">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex gap-4">
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-200 mb-1">{title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-6 text-center text-xs text-gray-600">
        © 2024 ElevatedPOS. Developer Platform — API v1.2.0
      </footer>
    </div>
  );
}
