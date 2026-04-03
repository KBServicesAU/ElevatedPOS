/**
 * Shared formatting utilities for the web-backoffice.
 */

/** Convert a cent-denominated integer to a dollar string. e.g. 1050 → "$10.50" */
export function formatCurrency(cents: number): string {
  const n = Number(cents);
  if (isNaN(n)) return '$0.00';
  return `$${(n / 100).toFixed(2)}`;
}

/**
 * Format a dollar-denominated amount (number or decimal string) to a currency string.
 * Used for values from the orders/payments services which return NUMERIC as decimal strings.
 * e.g. "11.5115" → "$11.51"
 */
export function formatDollars(dollars: number | string | null | undefined): string {
  const n = Number(dollars ?? 0);
  if (isNaN(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
}

/** Human-readable relative time from an ISO date string. e.g. "5m ago", "2h ago", "3d ago" */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/**
 * Format an ISO date string to a short Australian date.
 * Default: "5 Jan 2024". Pass custom options to override.
 */
export function formatDate(
  iso: string | undefined | null,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', options);
}

/** Extract a human-readable message from an unknown catch value. */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  return err instanceof Error ? err.message : fallback;
}
