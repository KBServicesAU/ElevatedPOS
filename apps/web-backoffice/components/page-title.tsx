'use client';

import { usePathname } from 'next/navigation';

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/orders': 'Orders',
  '/dashboard/quotes': 'Quotes',
  '/dashboard/catalog': 'Catalog',
  '/dashboard/price-lists': 'Price Lists',
  '/dashboard/markdowns': 'Markdowns',
  '/dashboard/inventory': 'Inventory',
  '/dashboard/transfers': 'Transfers',
  '/dashboard/purchase-orders': 'Purchase Orders',
  '/dashboard/suppliers': 'Suppliers',
  '/dashboard/stocktake': 'Stocktake',
  '/dashboard/customers': 'Customers',
  '/dashboard/reports': 'Reports',
  '/dashboard/staff': 'Staff',
  '/dashboard/timesheets': 'Timesheets',
  '/dashboard/loyalty': 'Loyalty',
  '/dashboard/memberships': 'Memberships',
  '/dashboard/gift-cards': 'Gift Cards',
  '/dashboard/laybys': 'Laybys',
  '/dashboard/fulfillment': 'Fulfillment',
  '/dashboard/campaigns': 'Campaigns',
  '/dashboard/franchise': 'Franchise',
  '/dashboard/alerts': 'Alerts',
  '/dashboard/integrations': 'Integrations',
  '/dashboard/webhooks': 'Webhooks',
  '/dashboard/automations': 'Automations',
  '/dashboard/locations': 'Locations',
  '/dashboard/settings': 'Settings',
};

export function PageTitle() {
  const pathname = usePathname();

  // Exact match first, then prefix match (for nested routes)
  const label =
    ROUTE_LABELS[pathname] ??
    Object.entries(ROUTE_LABELS)
      .filter(([k]) => k !== '/dashboard' && pathname.startsWith(k))
      .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ??
    'Dashboard';

  return (
    <h1 className="text-base font-semibold text-gray-900 dark:text-white">{label}</h1>
  );
}
