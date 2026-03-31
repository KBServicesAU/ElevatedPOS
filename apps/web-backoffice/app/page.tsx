import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default function HomePage() {
  // Redirect authenticated users straight to the dashboard
  const token = cookies().get('elevatedpos_token')?.value;
  if (token) {
    redirect('/dashboard');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-elevatedpos-950 via-elevatedpos-900 to-elevatedpos-800 p-8">
      <div className="mb-12 text-center">
        <div className="mb-4 inline-flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-elevatedpos-500 shadow-lg shadow-elevatedpos-500/30">
            <span className="text-2xl font-bold text-white">N</span>
          </div>
          <span className="text-4xl font-bold tracking-tight text-white">ElevatedPOS</span>
        </div>
        <p className="mt-2 text-lg text-elevatedpos-200">Unified Commerce &amp; Operations Platform</p>
        <p className="mt-1 text-sm text-elevatedpos-400">Australia-first · Cloud-native · AI-powered</p>
      </div>

      <div className="grid w-full max-w-4xl grid-cols-2 gap-4 md:grid-cols-3">
        {[
          { href: '/login', label: 'Sign In', icon: '🔐', desc: 'Access your dashboard' },
          { href: '/dashboard', label: 'Dashboard', icon: '📊', desc: 'Real-time overview' },
          { href: '/dashboard/catalog', label: 'Catalog', icon: '📦', desc: 'Products & categories' },
          { href: '/dashboard/inventory', label: 'Inventory', icon: '🏭', desc: 'Stock management' },
          { href: '/dashboard/customers', label: 'Customers', icon: '👥', desc: 'CRM & loyalty' },
          { href: '/dashboard/reports', label: 'Reports', icon: '📈', desc: 'Analytics & insights' },
          { href: '/dashboard/staff', label: 'Staff', icon: '👤', desc: 'Employees & shifts' },
          { href: '/dashboard/settings', label: 'Settings', icon: '⚙️', desc: 'Configuration' },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex flex-col gap-2 rounded-xl border border-elevatedpos-700/50 bg-elevatedpos-800/50 p-5 backdrop-blur transition-all hover:border-elevatedpos-500/50 hover:bg-elevatedpos-700/50 hover:shadow-lg hover:shadow-elevatedpos-500/10"
          >
            <span className="text-2xl">{item.icon}</span>
            <span className="font-semibold text-white group-hover:text-elevatedpos-200">{item.label}</span>
            <span className="text-xs text-elevatedpos-400">{item.desc}</span>
          </Link>
        ))}
      </div>

      <p className="mt-12 text-xs text-elevatedpos-600">
        ElevatedPOS v1.0 · Built with Next.js 14 · © {new Date().getFullYear()}
      </p>
    </main>
  );
}
