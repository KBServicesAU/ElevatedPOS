'use client';

import { usePathname } from 'next/navigation';

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/devices': 'Devices',
  '/dashboard/orders': 'Orders',
  '/dashboard/tables': 'Tables',
  '/dashboard/reservations': 'Reservations',
  '/dashboard/quotes': 'Quotes',
  '/dashboard/catalog': 'Catalog',
  '/dashboard/catalog/categories': 'Categories',
  '/dashboard/price-lists': 'Price Lists',
  '/dashboard/markdowns': 'Markdowns',
  '/dashboard/bulk-manage': 'Bulk Manage',
  '/dashboard/easy-move': 'Easy Move',
  '/dashboard/inventory': 'Inventory',
  '/dashboard/inventory/transfers': 'Transfers',
  '/dashboard/transfers': 'Transfers',
  '/dashboard/purchase-orders': 'Purchase Orders',
  '/dashboard/suppliers': 'Suppliers',
  '/dashboard/stocktake': 'Stocktake',
  '/dashboard/customers': 'Customers',
  '/dashboard/loyalty': 'Loyalty',
  '/dashboard/loyalty/stamps': 'Stamp Cards',
  '/dashboard/memberships': 'Memberships',
  '/dashboard/gift-cards': 'Gift Cards',
  '/dashboard/laybys': 'Laybys',
  '/dashboard/staff': 'Staff',
  '/dashboard/staff/roster': 'Roster',
  '/dashboard/timesheets': 'Timesheets',
  '/dashboard/reports': 'Reports',
  '/dashboard/payments': 'Payments & Connect',
  '/dashboard/subscriptions': 'Subscriptions',
  '/dashboard/subscriptions/plans': 'Subscription Plans',
  '/dashboard/invoices': 'Invoices',
  '/dashboard/payouts': 'Payouts',
  '/dashboard/transactions': 'Transactions',
  // v2.7.51 — /dashboard/billing removed; subscription moved into /dashboard/account.
  '/dashboard/store': 'Web Store',
  '/dashboard/campaigns': 'Campaigns',
  '/dashboard/franchise': 'Franchise',
  '/dashboard/alerts': 'Alerts',
  '/dashboard/integrations': 'Integrations',
  '/dashboard/webhooks': 'Webhooks',
  '/dashboard/automations': 'Automations',
  '/dashboard/locations': 'Locations',
  '/dashboard/account': 'My Account',
  '/dashboard/settings': 'Settings',
};

export function PageTitle() {
  const pathname = usePathname();

  // Exact match first, then prefix match (for nested routes)
  const label =
    (pathname ? ROUTE_LABELS[pathname] : undefined) ??
    Object.entries(ROUTE_LABELS)
      .filter(([k]) => k !== '/dashboard' && (pathname?.startsWith(k) ?? false))
      .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ??
    'Dashboard';

  return (
    <h1 className="text-base font-semibold text-gray-900 dark:text-white">{label}</h1>
  );
}
