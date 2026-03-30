// Exchange rate fetching and currency utilities
// In production: fetch from RBA (Reserve Bank of Australia) or Open Exchange Rates API
// For dev: use hardcoded rates

export const SUPPORTED_CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'NZD', 'SGD', 'JPY', 'CAD'];

export const DEV_EXCHANGE_RATES: Record<string, number> = {
  // Base: AUD
  AUD: 1.0,
  USD: 0.65,
  EUR: 0.60,
  GBP: 0.51,
  NZD: 1.09,
  SGD: 0.87,
  JPY: 98.5,
  CAD: 0.89,
};

/**
 * Convert an amount from one currency to another using the dev exchange rates.
 * In production, replace DEV_EXCHANGE_RATES with live rates fetched from an external API.
 */
export function convertAmount(amount: number, fromCurrency: string, toCurrency: string): number {
  const fromRate = DEV_EXCHANGE_RATES[fromCurrency] ?? 1;
  const toRate = DEV_EXCHANGE_RATES[toCurrency] ?? 1;
  return Math.round((amount / fromRate) * toRate * 100) / 100;
}

/**
 * Format an amount as a currency string using Australian locale conventions.
 */
export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amount);
}
