/**
 * Catalog utility functions for pricing, validation, and formatting.
 */

/**
 * Format a numeric price amount as a currency string.
 * @param amount Price in dollars (e.g. 12.5)
 * @param currency ISO currency code (default "AUD")
 * @returns Formatted string e.g. "$12.50"
 */
export function formatPrice(amount: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amount);
}

/**
 * Calculate the final price of a bundle from its components.
 * Supports 'percentage' and 'fixed' discount types.
 * @param components Array of bundle components with price and quantity
 * @param discountType Either 'percentage' or 'fixed'
 * @param discountValue The discount amount (% or $ depending on type)
 * @returns Final bundle price (never negative)
 */
export function calculateBundlePrice(
  components: Array<{ price: number; quantity: number }>,
  discountType: string,
  discountValue: number,
): number {
  const baseTotal = components.reduce((sum, c) => sum + c.price * c.quantity, 0);
  let discounted: number;
  if (discountType === 'percentage') {
    discounted = baseTotal * (1 - discountValue / 100);
  } else if (discountType === 'fixed') {
    discounted = baseTotal - discountValue;
  } else {
    discounted = baseTotal;
  }
  return Math.max(0, discounted);
}

/**
 * Convert a product name into a URL-safe slug.
 * @param name Product name string
 * @returns Lowercase hyphenated slug
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Validate a product SKU: alphanumeric with dashes and underscores, max 64 chars.
 * @param sku SKU string to validate
 * @returns true if valid, false otherwise
 */
export function validateSku(sku: string): boolean {
  if (!sku || sku.length === 0 || sku.length > 64) return false;
  return /^[A-Za-z0-9_-]+$/.test(sku);
}

/**
 * Compute the discounted price for a markdown promotion.
 * @param basePrice Original price in dollars
 * @param discountType 'percentage' or 'fixed'
 * @param discountValue Discount amount (% or $ depending on type)
 * @returns Markdown price (never negative)
 */
export function computeMarkdownPrice(
  basePrice: number,
  discountType: 'percentage' | 'fixed',
  discountValue: number,
): number {
  if (discountType === 'percentage') {
    return Math.max(0, basePrice * (1 - discountValue / 100));
  }
  return Math.max(0, basePrice - discountValue);
}

/**
 * Build the EAN-13 check digit for a 12-digit barcode string.
 * Implements the standard weighted sum algorithm.
 * @param barcode 12-digit barcode string (digits only)
 * @returns Single check digit character
 */
export function buildBarcodeCheckDigit(barcode: string): string {
  if (!/^\d{12}$/.test(barcode)) {
    throw new Error('Barcode must be exactly 12 digits');
  }
  const digits = barcode.split('').map(Number);
  const sum = digits.reduce((acc, digit, index) => {
    return acc + digit * (index % 2 === 0 ? 1 : 3);
  }, 0);
  const checkDigit = (10 - (sum % 10)) % 10;
  return String(checkDigit);
}
