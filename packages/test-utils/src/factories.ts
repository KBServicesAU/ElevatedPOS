import { v4 as uuidv4 } from 'uuid';

export function makeOrganisation(overrides: Record<string, unknown> = {}) {
  return {
    id: uuidv4(),
    name: 'Test Organisation',
    slug: 'test-organisation',
    country: 'AU',
    currency: 'AUD',
    timezone: 'Australia/Sydney',
    plan: 'growth',
    planStatus: 'active',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function makeLocation(overrides: Record<string, unknown> = {}) {
  return {
    id: uuidv4(),
    orgId: uuidv4(),
    brandId: uuidv4(),
    name: 'Test Location',
    addressLine1: '123 Test Street',
    suburb: 'Sydney',
    state: 'NSW',
    postcode: '2000',
    country: 'AU',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    isActive: true,
    isFranchiseLocation: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function makeEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: uuidv4(),
    orgId: uuidv4(),
    firstName: 'Test',
    lastName: 'Employee',
    email: `test.employee.${uuidv4()}@example.com`,
    roleId: uuidv4(),
    locationIds: [],
    employmentType: 'full_time',
    isActive: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: uuidv4(),
    orgId: uuidv4(),
    name: 'Test Product',
    sku: `TEST-${uuidv4().slice(0, 8).toUpperCase()}`,
    barcodes: [],
    basePrice: 9.99,
    costPrice: 5.00,
    taxClassId: uuidv4(),
    isActive: true,
    isSoldOnline: false,
    isSoldInstore: true,
    trackStock: true,
    productType: 'standard',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: uuidv4(),
    orgId: uuidv4(),
    locationId: uuidv4(),
    registerId: uuidv4(),
    orderNumber: `ORD-${Date.now()}`,
    channel: 'pos',
    orderType: 'retail',
    status: 'open',
    employeeId: uuidv4(),
    subtotal: 9.99,
    discountTotal: 0,
    taxTotal: 0.91,
    total: 10.90,
    paidTotal: 0,
    changeGiven: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
