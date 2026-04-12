'use client';

import {
  LayoutDashboard, Package, Warehouse, Users,
  BarChart3, UserCircle, Settings, Zap,
  Star, Megaphone, Plug, ClipboardList, BellRing, Building2,
  Truck, Gift, CalendarCheck, ArrowLeftRight, MapPin, Clock, Webhook, ShoppingCart,
  FileText, Tag, CreditCard, ChefHat, Tablet, Smartphone, Receipt, RefreshCw, Globe,
  Banknote, ArrowDownToLine, Wallet, ArrowUpDown, UserCog, MoveRight, LayoutGrid, Calendar,
  Tv,
} from 'lucide-react';
import { NavLink } from './nav-link';

// ─── Role helpers ─────────────────────────────────────────────────────────────

type Role = string | null | undefined;

const OWNER_ONLY   = ['owner'];
const ADMIN        = ['owner', 'manager'];
const OPS          = ['owner', 'manager', 'supervisor'];
const ALL_STAFF    = ['owner', 'manager', 'supervisor', 'cashier', 'barista', 'kitchen'];

function canAccess(allowed: string[], role: Role): boolean {
  if (!role) return true; // no role info → show everything (graceful degradation)
  return allowed.includes(role);
}

// ─── Navigation definition ───────────────────────────────────────────────────

interface NavItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  roles?: string[]; // undefined = visible to all authenticated users
}

const nav: NavItem[] = [
  // ── Core ──────────────────────────────────────────────────────────────────
  { href: '/dashboard',                     icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/pos',                           icon: CreditCard,      label: 'POS Terminal' },
  { href: '/kds',                           icon: ChefHat,         label: 'KDS Display' },
  { href: '/kiosk',                         icon: Tablet,          label: 'Kiosk' },
  { href: '/display',                       icon: Tv,              label: 'Display' },

  // ── Operations ────────────────────────────────────────────────────────────
  { href: '/dashboard/devices',             icon: Smartphone,      label: 'Devices',          roles: OPS },
  { href: '/dashboard/display',             icon: Tv,              label: 'Display Screens',  roles: OPS },
  { href: '/dashboard/orders',              icon: ClipboardList,   label: 'Orders',            roles: OPS },
  { href: '/dashboard/tables',              icon: LayoutGrid,      label: 'Tables',            roles: OPS },
  { href: '/dashboard/reservations',        icon: CalendarCheck,   label: 'Reservations',      roles: OPS },
  { href: '/dashboard/quotes',              icon: FileText,        label: 'Quotes',            roles: OPS },
  { href: '/dashboard/fulfillment',         icon: Truck,           label: 'Fulfillment',       roles: OPS },

  // ── Catalog & Pricing ─────────────────────────────────────────────────────
  { href: '/dashboard/catalog',             icon: Package,         label: 'Catalog',           roles: OPS },
  { href: '/dashboard/catalog/categories',  icon: Tag,             label: 'Categories',        roles: OPS },
  { href: '/dashboard/price-lists',         icon: Tag,             label: 'Price Lists',       roles: OPS },
  { href: '/dashboard/markdowns',           icon: Tag,             label: 'Markdowns',         roles: OPS },
  { href: '/dashboard/bulk-manage',         icon: ArrowUpDown,     label: 'Bulk Manage',       roles: OPS },

  // ── Inventory ─────────────────────────────────────────────────────────────
  { href: '/dashboard/inventory',           icon: Warehouse,       label: 'Inventory',         roles: OPS },
  { href: '/dashboard/transfers',           icon: ArrowLeftRight,  label: 'Transfers',         roles: OPS },
  { href: '/dashboard/purchase-orders',     icon: ShoppingCart,    label: 'Purchase Orders',   roles: OPS },
  { href: '/dashboard/suppliers',           icon: Truck,           label: 'Suppliers',         roles: OPS },
  { href: '/dashboard/stocktake',           icon: ClipboardList,   label: 'Stocktake',         roles: OPS },

  // ── Customers & Loyalty ───────────────────────────────────────────────────
  { href: '/dashboard/customers',           icon: Users,           label: 'Customers',         roles: OPS },
  { href: '/dashboard/loyalty',             icon: Star,            label: 'Loyalty',           roles: OPS },
  { href: '/dashboard/memberships',         icon: Users,           label: 'Memberships',       roles: OPS },
  { href: '/dashboard/gift-cards',          icon: Gift,            label: 'Gift Cards',        roles: OPS },
  { href: '/dashboard/laybys',              icon: CalendarCheck,   label: 'Laybys',            roles: OPS },

  // ── Staff ─────────────────────────────────────────────────────────────────
  { href: '/dashboard/staff',               icon: UserCircle,      label: 'Staff',             roles: ADMIN },
  { href: '/dashboard/staff/roster',        icon: Calendar,        label: 'Roster',            roles: ADMIN },
  { href: '/dashboard/timesheets',          icon: Clock,           label: 'Timesheets',        roles: OPS },

  // ── Reports ───────────────────────────────────────────────────────────────
  { href: '/dashboard/reports',             icon: BarChart3,       label: 'Reports',           roles: OPS },

  // ── Finance ───────────────────────────────────────────────────────────────
  { href: '/dashboard/payments',            icon: CreditCard,      label: 'Payments & Connect', roles: ADMIN },
  { href: '/dashboard/subscriptions',       icon: RefreshCw,       label: 'Subscriptions',     roles: ADMIN },
  { href: '/dashboard/invoices',            icon: Receipt,         label: 'Invoices',          roles: ADMIN },
  { href: '/dashboard/payouts',             icon: ArrowDownToLine, label: 'Payouts',           roles: ADMIN },
  { href: '/dashboard/transactions',        icon: Banknote,        label: 'Transactions',      roles: ADMIN },
  { href: '/dashboard/billing',             icon: Wallet,          label: 'Billing',           roles: OWNER_ONLY },

  // ── Marketing ─────────────────────────────────────────────────────────────
  { href: '/dashboard/store',               icon: Globe,           label: 'Web Store',         roles: ADMIN },
  { href: '/dashboard/campaigns',           icon: Megaphone,       label: 'Campaigns',         roles: ADMIN },

  // ── Platform ──────────────────────────────────────────────────────────────
  { href: '/dashboard/franchise',           icon: Building2,       label: 'Franchise',         roles: OWNER_ONLY },
  { href: '/dashboard/alerts',              icon: BellRing,        label: 'Alerts',            roles: ADMIN },
  { href: '/dashboard/integrations',        icon: Plug,            label: 'Integrations',      roles: ADMIN },
  { href: '/dashboard/webhooks',            icon: Webhook,         label: 'Webhooks',          roles: ADMIN },
  { href: '/dashboard/automations',         icon: Zap,             label: 'Automations',       roles: ADMIN },
  { href: '/dashboard/locations',           icon: MapPin,          label: 'Locations',         roles: ADMIN },
  { href: '/dashboard/easy-move',           icon: MoveRight,       label: 'Easy Move',         roles: ADMIN },

  // ── My account / Settings ─────────────────────────────────────────────────
  { href: '/dashboard/account',             icon: UserCog,         label: 'Account' },
  { href: '/dashboard/settings',            icon: Settings,        label: 'Settings',          roles: ADMIN },
];

// ─── Component ───────────────────────────────────────────────────────────────

interface SidebarNavProps {
  onNavigate?: () => void;
  role?: Role;
}

export function SidebarNav({ onNavigate, role }: SidebarNavProps) {
  const visible = nav.filter((item) => !item.roles || canAccess(item.roles, role));

  return (
    <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3 pb-2">
      {visible.map(({ href, icon, label }) => (
        <NavLink key={href} href={href} icon={icon} label={label} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}
