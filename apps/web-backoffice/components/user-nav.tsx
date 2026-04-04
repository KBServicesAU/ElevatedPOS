'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, LogOut, User } from 'lucide-react';

interface UserNavProps {
  firstName: string;
  lastName: string;
  role: string | null;
}

function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function UserNav({ firstName, lastName, role }: UserNavProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore network errors — cookie will expire naturally
    }
    router.push('/login');
    router.refresh();
  }

  const initStr = initials(firstName, lastName);
  const fullName = `${firstName} ${lastName}`.trim();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 shrink-0">
          {initStr}
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="truncate font-medium text-gray-700 dark:text-gray-200">{fullName}</p>
          {role && <p className="truncate text-xs text-gray-400 capitalize">{role}</p>}
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900 z-50">
          <div className="border-b border-gray-100 px-4 py-2 dark:border-gray-800">
            <p className="text-xs font-medium text-gray-900 dark:text-white">{fullName}</p>
            <p className="text-xs text-gray-400">{role ?? 'Staff'}</p>
          </div>

          <Link
            href="/dashboard/account"
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
            onClick={() => setOpen(false)}
          >
            <User className="h-4 w-4 text-gray-400" />
            My Account
          </Link>

          <button
            disabled={loading}
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            {loading ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
