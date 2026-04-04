'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Link2,
  Building2,
  LogOut,
  Menu,
  X,
  TrendingUp,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/links', label: 'My Links', icon: Link2 },
  { href: '/dashboard/merchants', label: 'My Merchants', icon: Building2 },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 flex flex-col bg-gray-900 border-r border-gray-800 transform transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Branding */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-800">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
            <TrendingUp size={16} className="text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Sales Portal</p>
            <p className="text-gray-400 text-xs">ElevatedPOS</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="px-3 py-4 border-t border-gray-800">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-semibold">SA</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">Sales Agent</p>
              <p className="text-gray-500 text-xs truncate">sales_agent</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-white"
          >
            <Menu size={22} />
          </button>
          <span className="font-semibold text-white text-sm">Sales Portal</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto text-gray-500 hover:text-gray-300"
          >
            <X size={20} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6 bg-gray-950">
          {children}
        </main>
      </div>
    </div>
  );
}
