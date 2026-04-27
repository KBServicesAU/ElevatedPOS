import { redirect } from 'next/navigation';

/**
 * Legacy /dashboard/store path — kept as a redirect to /dashboard/web-store
 * (v2.7.51-F2 renamed it for clarity). Bookmarks and any external links keep
 * working without breaking the rebuilt page.
 */
export default function LegacyStorePage(): never {
  redirect('/dashboard/web-store');
}
