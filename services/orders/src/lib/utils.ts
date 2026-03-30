/**
 * Order utility functions for business logic calculations.
 * Covers AU Consumer Law requirements (lay-by deposits, cancellation fees).
 */

/**
 * Calculate the total value of order lines, applying optional per-line discounts.
 * @param lines Array of line items with quantity, unitPrice and optional discountPercent
 * @returns Total amount after per-line discounts (no tax included)
 */
export function calculateOrderTotal(
  lines: Array<{ quantity: number; unitPrice: number; discountPercent?: number }>,
): number {
  return lines.reduce((sum, line) => {
    const lineSubtotal = line.quantity * line.unitPrice;
    const discount = lineSubtotal * ((line.discountPercent ?? 0) / 100);
    return sum + (lineSubtotal - discount);
  }, 0);
}

/**
 * Apply an order-level percentage discount to a subtotal.
 * Optionally cap the discount at a maximum dollar amount.
 * @param subtotal The pre-discount subtotal
 * @param discountPercent Percentage to discount (0–100)
 * @param maxDiscount Optional maximum discount amount in dollars
 * @returns Discounted total (never negative)
 */
export function applyDiscountToTotal(
  subtotal: number,
  discountPercent: number,
  maxDiscount?: number,
): number {
  if (discountPercent < 0 || discountPercent > 100) {
    throw new RangeError('discountPercent must be between 0 and 100');
  }
  let discount = subtotal * (discountPercent / 100);
  if (maxDiscount !== undefined) {
    discount = Math.min(discount, maxDiscount);
  }
  return Math.max(0, subtotal - discount);
}

/**
 * Format a human-readable order number from components.
 * e.g. formatOrderNumber("ORD", 2024, 1) → "ORD-2024-000001"
 * @param orgPrefix Short prefix string (e.g. "ORD")
 * @param year 4-digit year
 * @param sequence Sequential counter
 * @returns Formatted order number string
 */
export function formatOrderNumber(orgPrefix: string, year: number, sequence: number): string {
  const paddedSeq = String(sequence).padStart(6, '0');
  return `${orgPrefix}-${year}-${paddedSeq}`;
}

/**
 * Validate that a lay-by deposit meets the minimum required percentage.
 * Under Australian Consumer Law, the minimum deposit is 10% of the total.
 * @param totalAmount Total lay-by amount
 * @param depositAmount Deposit amount provided
 * @param minDepositPercent Minimum deposit percentage (default 10 per AU law)
 * @returns true if deposit is sufficient, false otherwise
 */
export function validateLaybyDeposit(
  totalAmount: number,
  depositAmount: number,
  minDepositPercent = 10,
): boolean {
  if (totalAmount <= 0) return false;
  const minRequired = totalAmount * (minDepositPercent / 100);
  return depositAmount >= minRequired;
}

/**
 * Calculate the cancellation fee for a lay-by agreement.
 * Under Australian Consumer Law, retailers may charge a reasonable fee.
 * @param totalPaid Total amount paid by the customer so far
 * @param feePercent Percentage of paid amount to retain as fee (default 20%)
 * @returns Cancellation fee amount (never negative)
 */
export function calculateLaybyCancellationFee(totalPaid: number, feePercent = 20): number {
  if (feePercent < 0 || feePercent > 100) {
    throw new RangeError('feePercent must be between 0 and 100');
  }
  return Math.max(0, totalPaid * (feePercent / 100));
}

/**
 * Estimate the completion date of a lay-by based on average monthly payments.
 * @param remainingBalance Amount still owed
 * @param avgMonthlyPayment Average monthly payment amount
 * @returns Estimated completion Date (rounds up to whole months from today)
 */
export function estimateCompletionDate(remainingBalance: number, avgMonthlyPayment: number): Date {
  if (avgMonthlyPayment <= 0) {
    throw new RangeError('avgMonthlyPayment must be greater than 0');
  }
  const monthsNeeded = Math.ceil(remainingBalance / avgMonthlyPayment);
  const completionDate = new Date();
  completionDate.setMonth(completionDate.getMonth() + monthsNeeded);
  return completionDate;
}
