'use client';

import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { SidebarNav } from './sidebar-nav';
import { UserNav } from './user-nav';
import { PageTitle } from './page-title';
import { NotificationBell } from './notification-bell';
import { ThemeToggle } from './theme-toggle';
import AICopilot from './AICopilot';
import { AppSwitcher } from './app-switcher';
import { LocationPicker } from './location-picker';

interface DashboardShellProps {
  children: React.ReactNode;
  firstName: string;
  lastName: string;
  role: string | null;
  featureFlags?: Record<string, boolean> | null;
}

export function DashboardShell({ children, firstName, lastName, role, featureFlags }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    const handleRouteChange = () => setSidebarOpen(false);
    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">

      {/* ── Mobile overlay ────────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────────── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-gray-200
          bg-white transition-transform duration-200 ease-in-out
          dark:border-gray-800 dark:bg-gray-900
          lg:static lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between gap-3 border-b border-gray-200 px-4 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-elevatedpos-500 shadow-sm">
              <span className="text-base font-bold text-white">E</span>
            </div>
            <span className="text-lg font-bold text-gray-900 dark:text-white">ElevatedPOS</span>
          </div>
          {/* Close button — mobile only */}
          <button
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden dark:hover:bg-gray-800"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Location picker */}
        <LocationPicker />

        {/* Nav links */}
        <SidebarNav onNavigate={() => setSidebarOpen(false)} role={role} featureFlags={featureFlags} />

        {/* User */}
        <div className="border-t border-gray-200 p-3 dark:border-gray-800">
          <UserNav firstName={firstName} lastName={lastName} role={role} />
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 lg:hidden dark:hover:bg-gray-800"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <PageTitle />
          </div>
          <div className="flex items-center gap-2">
            <AppSwitcher currentApp="dashboard" />
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>

      {/* AI Copilot floating widget */}
      <AICopilot />
    </div>
  );
}
