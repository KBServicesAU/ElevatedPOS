import Link from 'next/link';
import {
  LayoutDashboard, Package, Warehouse, Users,
  BarChart3, UserCircle, Settings, Zap, Bell, ChevronDown,
  Star, Megaphone, Plug, ClipboardList,
} from 'lucide-react';

const nav = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/dashboard/orders', icon: ClipboardList, label: 'Orders' },
  { href: '/dashboard/catalog', icon: Package, label: 'Catalog' },
  { href: '/dashboard/inventory', icon: Warehouse, label: 'Inventory' },
  { href: '/dashboard/customers', icon: Users, label: 'Customers' },
  { href: '/dashboard/reports', icon: BarChart3, label: 'Reports' },
  { href: '/dashboard/staff', icon: UserCircle, label: 'Staff' },
  { href: '/dashboard/loyalty', icon: Star, label: 'Loyalty' },
  { href: '/dashboard/campaigns', icon: Megaphone, label: 'Campaigns' },
  { href: '/dashboard/integrations', icon: Plug, label: 'Integrations' },
  { href: '/dashboard/automations', icon: Zap, label: 'Automations' },
  { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-4 dark:border-gray-800">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-nexus-500 shadow-sm">
            <span className="text-base font-bold text-white">N</span>
          </div>
          <span className="text-lg font-bold text-gray-900 dark:text-white">NEXUS</span>
        </div>

        {/* Location picker */}
        <button className="mx-3 mt-3 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm dark:border-gray-700 dark:bg-gray-800">
          <div>
            <p className="font-medium text-gray-700 dark:text-gray-200">Main Location</p>
            <p className="text-xs text-gray-400">Sydney CBD</p>
          </div>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </button>

        {/* Nav */}
        <nav className="mt-4 flex-1 space-y-0.5 px-3">
          {nav.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-gray-200 p-3 dark:border-gray-800">
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-nexus-100 text-xs font-bold text-nexus-700 dark:bg-nexus-900 dark:text-nexus-300">
              JD
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate font-medium text-gray-700 dark:text-gray-200">Jane Doe</p>
              <p className="truncate text-xs text-gray-400">Manager</p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6 dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-base font-semibold text-gray-900 dark:text-white">Dashboard</h1>
          <div className="flex items-center gap-3">
            <button className="relative rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
