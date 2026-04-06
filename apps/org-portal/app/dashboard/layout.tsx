'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  MonitorSmartphone,
  ScrollText,
  LogOut,
  Menu,
  X,
  Users,
  ShoppingCart,
  Link2,
  Sun,
  Moon,
} from 'lucide-react';
import { useTheme } from '../theme-provider';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/merchants', label: 'Merchants', icon: Building2 },
  { href: '/dashboard/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/dashboard/signup-links', label: 'Signup Links', icon: Link2 },
  { href: '/dashboard/devices', label: 'Devices', icon: MonitorSmartphone },
  { href: '/dashboard/actions-log', label: 'Actions Log', icon: ScrollText },
  { href: '/dashboard/staff', label: 'Staff', icon: Users },
];

interface JwtUser {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<JwtUser>({});

  useEffect(() => {
    // Fetch user info from a dedicated me endpoint that reads the httpOnly cookie server-side
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: JwtUser | null) => {
        if (data) setUser(data);
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const displayName =
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.firstName ?? user.email ?? 'Support Staff';

  const initials =
    user.firstName && user.lastName
      ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
      : user.firstName
      ? user.firstName.slice(0, 2).toUpperCase()
      : 'SP';

  const roleLabel = user.role ?? 'support';

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 flex flex-col bg-blue-900 dark:bg-gray-900 border-r border-transparent dark:border-gray-800 transform transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Branding */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-blue-800 dark:border-gray-800">
          <div className="w-8 h-8 rounded-lg bg-blue-600 dark:bg-blue-700 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">E</span>
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Support Portal</p>
            <p className="text-blue-300 dark:text-gray-400 text-xs">ElevatedPOS</p>
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
                    ? 'bg-blue-600 dark:bg-blue-800 text-white'
                    : 'text-blue-200 dark:text-gray-400 hover:bg-blue-800 dark:hover:bg-gray-800 hover:text-white dark:hover:text-white'
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="px-3 py-4 border-t border-blue-800 dark:border-gray-800">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-blue-600 dark:bg-blue-700 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-semibold">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{displayName}</p>
              <p className="text-blue-300 dark:text-gray-400 text-xs truncate capitalize">{roleLabel}</p>
            </div>
          </div>
          <button
            onClick={toggle}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-blue-200 dark:text-gray-400 hover:bg-blue-800 dark:hover:bg-gray-800 hover:text-white dark:hover:text-white transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-blue-200 dark:text-gray-400 hover:bg-blue-800 dark:hover:bg-gray-800 hover:text-white dark:hover:text-white transition-colors"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <Menu size={22} />
          </button>
          <span className="font-semibold text-gray-800 dark:text-white text-sm">Support Portal</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={20} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
