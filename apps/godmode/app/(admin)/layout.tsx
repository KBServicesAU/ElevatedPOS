import { cookies } from 'next/headers';
import Link from 'next/link';
import {
  LayoutDashboard,
  Building2,
  Monitor,
  Users,
  ScrollText,
  Activity,
  UserCog,
  HandshakeIcon,
  CreditCard,
  Link as LinkIcon,
  Settings,
} from 'lucide-react';
import { LogoutButton } from './LogoutButton';

interface JwtPayload {
  firstName?: string;
  lastName?: string;
  role?: string;
  email?: string;
}

function decodeJwt(token: string): JwtPayload {
  try {
    const base64 = token.split('.')[1] ?? '';
    const json = Buffer.from(base64, 'base64url').toString('utf-8');
    return JSON.parse(json) as JwtPayload;
  } catch {
    return {};
  }
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/merchants', label: 'Merchants', Icon: Building2 },
  { href: '/devices', label: 'Devices', Icon: Monitor },
  { href: '/staff', label: 'Platform Staff', Icon: Users },
  { href: '/org-accounts', label: 'Org Portal Accounts', Icon: UserCog },
  { href: '/reseller-accounts', label: 'Reseller Accounts', Icon: HandshakeIcon },
  { href: '/plans', label: 'Plans', Icon: CreditCard },
  { href: '/signup-links', label: 'Signup Links', Icon: LinkIcon },
  { href: '/audit', label: 'Audit Log', Icon: ScrollText },
  { href: '/system', label: 'System Health', Icon: Activity },
  { href: '/settings', label: 'Settings', Icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const token = cookieStore.get('godmode_token')?.value ?? '';
  const payload = decodeJwt(token);
  const displayName =
    payload.firstName && payload.lastName
      ? `${payload.firstName} ${payload.lastName}`
      : (payload.email ?? 'Unknown');

  return (
    <div className="flex min-h-screen bg-[#0a0a0f]">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-[#111118] border-r border-[#1e1e2e] flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-[#1e1e2e]">
          <div className="flex items-center gap-2">
            <span className="text-red-500 font-black text-xl tracking-widest uppercase">Godmode</span>
          </div>
          <p className="text-gray-600 text-xs mt-1">ElevatedPOS Platform</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded text-gray-400 hover:text-white hover:bg-[#1e1e2e] transition-colors text-sm"
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-[#1e1e2e]">
          <div className="mb-3">
            <p className="text-white text-sm font-medium truncate">{displayName}</p>
            <p className="text-gray-500 text-xs capitalize">{payload.role ?? 'platform'}</p>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
