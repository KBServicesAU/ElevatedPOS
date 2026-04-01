import { randomUUID } from 'crypto';

/**
 * Payment utility functions: formatting, validation, and reference generation.
 */

/**
 * Format a numeric amount as a currency string for a given ISO currency code.
 * @param amount Numeric amount (e.g. 19.99)
 * @param currency ISO 4217 currency code (e.g. "AUD", "USD")
 * @returns Formatted currency string (e.g. "A$19.99")
 */
export function formatCurrencyAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amount);
}

/**
 * Validate a credit card number using the Luhn algorithm.
 * Strips spaces and dashes before validation.
 * @param cardNumber Card number string (may include spaces or dashes)
 * @returns true if the number passes Luhn check, false otherwise
 */
export function validateCardNumber(cardNumber: string): boolean {
  const digits = cardNumber.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits) || digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i] ?? '', 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/**
 * Mask a credit card number, showing only the last 4 digits.
 * Output format: "**** **** **** 1234"
 * @param cardNumber Full card number string (spaces/dashes stripped internally)
 * @returns Masked card string
 */
export function maskCardNumber(cardNumber: string): string {
  const digits = cardNumber.replace(/[\s-]/g, '');
  const last4 = digits.slice(-4);
  const groups = ['****', '****', '****', last4];
  return groups.join(' ');
}

/**
 * Compute the processing fee for a payment given provider and rate.
 * @param amount Transaction amount in dollars
 * @param provider Payment provider name (informational, not used in calc)
 * @param feePercent Provider fee percentage (e.g. 1.75 for 1.75%)
 * @returns Fee amount in dollars (rounded to 2 decimal places)
 */
export function computePaymentFee(amount: number, provider: string, feePercent: number): number {
  void provider; // provider name may be used for tiered logic in future
  return Math.round(amount * (feePercent / 100) * 100) / 100;
}

/**
 * Generate a unique payment reference string using a prefix and UUID.
 * @param prefix Short prefix string (e.g. "PAY", "REF")
 * @returns Reference string e.g. "PAY-550e8400-e29b-41d4-a716-446655440000"
 */
export function generatePaymentReference(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

/**
 * Determine whether a payment is eligible for refund.
 * Payments must have status 'captured' and be within the refund window.
 * @param status Payment status string
 * @param createdAt Date the payment was captured
 * @param maxDays Maximum days after capture within which refund is allowed (default 90)
 * @returns true if refundable, false otherwise
 */
export function isRefundable(status: string, createdAt: Date, maxDays = 90): boolean {
  if (status !== 'captured') return false;
  const ageMs = Date.now() - createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays <= maxDays;
}
