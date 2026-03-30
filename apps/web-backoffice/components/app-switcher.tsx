'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { LayoutDashboard, CreditCard, Grid2X2, ChefHat, Tablet } from 'lucide-react';

const APPS = [
  { id: 'dashboard', label: 'Dashboard',   description: 'Back office & management', icon: LayoutDashboard, href: '/dashboard', color: 'bg-nexus-500'   },
  { id: 'pos',       label: 'POS',         description: 'Point of sale terminal',   icon: CreditCard,      href: '/pos',       color: 'bg-emerald-500' },
  { id: 'kds',       label: 'KDS Display', description: 'Kitchen display system',   icon: ChefHat,         href: '/kds',       color: 'bg-orange-500'  },
  { id: 'kiosk',     label: 'Kiosk',       description: 'Self-service ordering',    icon: Tablet,          href: '/kiosk',     color: 'bg-yellow-500'  },
] as const;

interface AppSwitcherProps {
  currentApp?: string;
}

export function AppSwitcher({ currentApp = 'dashboard' }: AppSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch app"
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors duration-150 ${
          open
            ? 'bg-nexus-50 text-nexus-600 dark:bg-nexus-900/30 dark:text-nexus-400'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
        }`}
      >
        <Grid2X2 className="h-4 w-4" />
        <span className="hidden sm:inline">Apps</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              NEXUS Platform
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 p-2">
            {APPS.map((app) => {
              const Icon = app.icon;
              const isCurrent = app.id === currentApp;
              return (
                <Link
                  key={app.id}
                  href={app.href}
                  onClick={() => setOpen(false)}
                  className={`flex flex-col items-start gap-2 rounded-lg p-3 transition-colors duration-150 ${
                    isCurrent
                      ? 'bg-nexus-50 ring-1 ring-nexus-200 dark:bg-nexus-900/20 dark:ring-nexus-800'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${app.color} shadow-sm`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className={`text-sm font-medium ${isCurrent ? 'text-nexus-700 dark:text-nexus-300' : 'text-gray-800 dark:text-gray-100'}`}>
                        {app.label}
                      </span>
                      {isCurrent && (
                        <span className="rounded-full bg-nexus-100 px-1.5 py-0.5 text-[10px] font-semibold text-nexus-600 dark:bg-nexus-900/40 dark:text-nexus-400">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                      {app.description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
