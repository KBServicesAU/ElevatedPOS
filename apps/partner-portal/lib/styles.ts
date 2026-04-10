/**
 * Shared badge styles for partner-portal — plan and status badges are used
 * across tenants/page.tsx, tenants/[id]/page.tsx, and billing/page.tsx.
 * Import from here instead of duplicating the constants in each file.
 */

export const PLAN_STYLES: Record<string, string> = {
  Starter: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  Growth: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  Pro: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
};

export const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  trial: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
};
