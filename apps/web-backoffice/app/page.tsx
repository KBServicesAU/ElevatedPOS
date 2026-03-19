import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-nexus-950 via-nexus-900 to-nexus-800 p-8">
      <div className="mb-12 text-center">
        <div className="mb-4 inline-flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-nexus-500 shadow-lg shadow-nexus-500/30">
            <span className="text-2xl font-bold text-white">N</span>
          </div>
          <span className="text-4xl font-bold tracking-tight text-white">NEXUS</span>
        </div>
        <p className="mt-2 text-lg text-nexus-200">Unified Commerce &amp; Operations Platform</p>
        <p className="mt-1 text-sm text-nexus-400">Australia-first · Cloud-native · AI-powered</p>
      </div>

      <div className="grid w-full max-w-4xl grid-cols-2 gap-4 md:grid-cols-3">
        {[
          { href: '/login', label: 'Sign In', icon: '🔐', desc: 'Access your dashboard' },
          { href: '/dashboard', label: 'Dashboard', icon: '📊', desc: 'Real-time overview' },
          { href: '/pos', label: 'POS Terminal', icon: '🛒', desc: 'Sell screen' },
          { href: '/catalog', label: 'Catalog', icon: '📦', desc: 'Products & categories' },
          { href: '/inventory', label: 'Inventory', icon: '🏭', desc: 'Stock management' },
          { href: '/customers', label: 'Customers', icon: '👥', desc: 'CRM & loyalty' },
          { href: '/reports', label: 'Reports', icon: '📈', desc: 'Analytics & insights' },
          { href: '/staff', label: 'Staff', icon: '👤', desc: 'Employees & shifts' },
          { href: '/settings', label: 'Settings', icon: '⚙️', desc: 'Configuration' },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex flex-col gap-2 rounded-xl border border-nexus-700/50 bg-nexus-800/50 p-5 backdrop-blur transition-all hover:border-nexus-500/50 hover:bg-nexus-700/50 hover:shadow-lg hover:shadow-nexus-500/10"
          >
            <span className="text-2xl">{item.icon}</span>
            <span className="font-semibold text-white group-hover:text-nexus-200">{item.label}</span>
            <span className="text-xs text-nexus-400">{item.desc}</span>
          </Link>
        ))}
      </div>

      <p className="mt-12 text-xs text-nexus-600">
        NEXUS v0.1.0 · Built with Next.js 14 · © 2025
      </p>
    </main>
  );
}
