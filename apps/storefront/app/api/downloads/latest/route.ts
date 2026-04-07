import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';
import { getLatestRelease, getAllReleases } from '@/lib/app-releases';

/**
 * GET /api/downloads/latest?app=pos
 *
 * Returns the latest release info for a specific app, or all apps if no
 * `app` query param is provided. Used by:
 *   - The /downloads storefront page
 *   - The mobile app's in-app update checker
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const app = searchParams.get('app');

  if (app) {
    const release = getLatestRelease(app);
    if (!release) {
      return NextResponse.json({ error: `Unknown app: ${app}` }, { status: 404 });
    }
    return NextResponse.json(release, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
    });
  }

  // Return all apps
  return NextResponse.json({ releases: getAllReleases() }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
  });
}
