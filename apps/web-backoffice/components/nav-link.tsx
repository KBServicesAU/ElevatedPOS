'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavLinkProps {
  href: string;
  icon: React.ElementType;
  label: string;
  onNavigate?: () => void;
}

export function NavLink({ href, icon: Icon, label, onNavigate }: NavLinkProps) {
  const pathname = usePathname();

  // Exact match for /dashboard, prefix match for all others
  const isActive =
    href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname === href || (pathname?.startsWith(href + '/') ?? false);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        isActive
          ? 'bg-indigo-50 font-medium text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
      }`}
    >
      <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-indigo-500 dark:text-indigo-400' : ''}`} />
      {label}
    </Link>
  );
}
