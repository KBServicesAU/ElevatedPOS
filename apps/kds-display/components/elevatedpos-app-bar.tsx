'use client';

import { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Monitor,
  Code2,
  Building2,
  CreditCard,
  Grid2X2,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';

const APPS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Back office & management',
    icon: LayoutDashboard,
    url: 'http://localhost:53111',
    color: 'bg-blue-600',
  },
  {
    id: 'kds',
    label: 'KDS Display',
    description: 'Kitchen display system',
    icon: Monitor,
    url: 'http://localhost:3001',
    color: 'bg-orange-500',
  },
  {
    id: 'partner',
    label: 'Partner Portal',
    description: 'Reseller management',
    icon: Building2,
    url: 'http://localhost:3003',
    color: 'bg-purple-500',
  },
  {
    id: 'developer',
    label: 'Dev Portal',
    description: 'API & integrations',
    icon: Code2,
    url: 'http://localhost:3002',
    color: 'bg-sky-500',
  },
  {
    id: 'pos',
    label: 'POS Client',
    description: 'Point of sale terminal',
    icon: CreditCard,
    url: 'http://localhost:8081',
    color: 'bg-emerald-500',
  },
] as const;

interface ElevatedPOSAppBarProps {
  currentApp: string;
  appLabel: string;
}

export function ElevatedPOSAppBar({ currentApp, appLabel }: ElevatedPOSAppBarProps) {
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
    <div className="relative z-50 flex h-10 items-center justify-between border-b border-gray-200 bg-white px-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      {/* Back to Dashboard */}
      <a
        href="http://localhost:53111"
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Dashboard</span>
      </a>

      {/* Current app name */}
      <span className="absolute left-1/2 -translate-x-1/2 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
        {appLabel}
      </span>

      {/* App switcher */}
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Switch app"
          aria-expanded={open}
          className={`
            flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium transition-colors
            ${open
              ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'}
          `}
        >
          <Grid2X2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline text-xs">Apps</span>
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1.5 w-72 rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">ElevatedPOS Platform</p>
            </div>
            <div className="grid grid-cols-2 gap-1 p-2">
              {APPS.map((app) => {
                const Icon = app.icon;
                const isCurrent = app.id === currentApp;
                return (
                  <a
                    key={app.id}
                    href={app.url}
                    onClick={() => setOpen(false)}
                    className={`
                      flex flex-col items-start gap-2 rounded-lg p-3 transition-colors
                      ${isCurrent ? 'bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}
                    `}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${app.color} shadow-sm`}>
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className={`text-sm font-medium ${isCurrent ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-100'}`}>
                          {app.label}
                        </span>
                        {isCurrent && (
                          <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{app.description}</p>
                    </div>
                  </a>
                );
              })}
            </div>
            <div className="border-t border-gray-100 px-4 py-2.5 dark:border-gray-800">
              <p className="flex items-center gap-1 text-[11px] text-gray-400">
                <ExternalLink className="h-3 w-3" />
                Opens in the same tab
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
