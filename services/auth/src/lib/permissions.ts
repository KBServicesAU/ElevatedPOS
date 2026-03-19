export type Permission =
  | '*'
  | 'sale.process'
  | 'sale.discount.apply'
  | 'sale.discount.apply_limited'
  | 'sale.refund.process'
  | 'sale.refund.outside_policy'
  | 'sale.void'
  | 'sale.comp'
  | 'cash.drawer.open'
  | 'shift.close'
  | 'catalog.edit'
  | 'catalog.price.edit'
  | 'inventory.manage'
  | 'inventory.adjust'
  | 'purchase_order.create'
  | 'purchase_order.approve'
  | 'staff.manage'
  | 'reports.view'
  | 'reports.export'
  | 'settings.manage'
  | 'integrations.manage'
  | 'automations.manage'
  | 'campaigns.manage'
  | 'customers.view'
  | 'customers.pii.view'
  | 'customers.delete'
  | 'loyalty.manage'
  | 'kds.view'
  | 'kds.bump'
  | 'payments.configure'
  | 'billing.manage'
  | 'api.access'
  | 'franchise.hq.view'
  | 'franchise.royalty.view';

export function hasPermission(
  permissions: Record<string, boolean>,
  required: Permission,
): boolean {
  if (permissions['*'] === true) return true;
  return permissions[required] === true;
}
