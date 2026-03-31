'use client';

import {
  LayoutDashboard, Package, Warehouse, Users,
  BarChart3, UserCircle, Settings, Zap,
  Star, Megaphone, Plug, ClipboardList, BellRing, Building2,
  Truck, Gift, CalendarCheck, ArrowLeftRight, MapPin, Clock, Webhook, ShoppingCart,
  FileText, Tag, CreditCard, ChefHat, Tablet, Smartphone,
} from 'lucide-react';
import { NavLink } from './nav-link';

const nav = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/pos', icon: CreditCard, label: 'POS Terminal' },
  { href: '/kds', icon: ChefHat, label: 'KDS Display' },
  { href: '/kiosk', icon: Tablet, label: 'Kiosk' },
  { href: '/dashboard/devices', icon: Smartphone, label: 'Devices' },
  { href: '/dashboard/orders', icon: ClipboardList, label: 'Orders' },
  { href: '/dashboard/quotes', icon: FileText, label: 'Quotes' },
  { href: '/dashboard/catalog', icon: Package, label: 'Catalog' },
  { href: '/dashboard/price-lists', icon: Tag, label: 'Price Lists' },
  { href: '/dashboard/markdowns', icon: Tag, label: 'Markdowns' },
  { href: '/dashboard/inventory', icon: Warehouse, label: 'Inventory' },
  { href: '/dashboard/transfers', icon: ArrowLeftRight, label: 'Transfers' },
  { href: '/dashboard/purchase-orders', icon: ShoppingCart, label: 'Purchase Orders' },
  { href: '/dashboard/suppliers', icon: Truck, label: 'Suppliers' },
  { href: '/dashboard/stocktake', icon: ClipboardList, label: 'Stocktake' },
  { href: '/dashboard/customers', icon: Users, label: 'Customers' },
  { href: '/dashboard/reports', icon: BarChart3, label: 'Reports' },
  { href: '/dashboard/staff', icon: UserCircle, label: 'Staff' },
  { href: '/dashboard/timesheets', icon: Clock, label: 'Timesheets' },
  { href: '/dashboard/loyalty', icon: Star, label: 'Loyalty' },
  { href: '/dashboard/memberships', icon: Users, label: 'Memberships' },
  { href: '/dashboard/gift-cards', icon: Gift, label: 'Gift Cards' },
  { href: '/dashboard/laybys', icon: CalendarCheck, label: 'Laybys' },
  { href: '/dashboard/fulfillment', icon: Truck, label: 'Fulfillment' },
  { href: '/dashboard/campaigns', icon: Megaphone, label: 'Campaigns' },
  { href: '/dashboard/franchise', icon: Building2, label: 'Franchise' },
  { href: '/dashboard/alerts', icon: BellRing, label: 'Alerts' },
  { href: '/dashboard/integrations', icon: Plug, label: 'Integrations' },
  { href: '/dashboard/webhooks', icon: Webhook, label: 'Webhooks' },
  { href: '/dashboard/automations', icon: Zap, label: 'Automations' },
  { href: '/dashboard/locations', icon: MapPin, label: 'Locations' },
  { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
];

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3 pb-2">
      {nav.map(({ href, icon, label }) => (
        <NavLink key={href} href={href} icon={icon} label={label} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}
