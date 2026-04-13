/**
 * Centralised release manifest for ElevatedPOS mobile apps.
 *
 * Static metadata (name, description, changelog) lives here.
 * Download URLs are resolved DYNAMICALLY from the EAS API at runtime,
 * so the /downloads page always points to the latest successful build
 * without any manual URL updates.
 */

export interface AppRelease {
  /** Machine-readable app identifier */
  app: 'pos' | 'kds' | 'kiosk' | 'dashboard' | 'display';
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** EAS build profile name used to query latest build */
  buildProfile: string;
  /** Semantic version (must match app.config.ts version) */
  version: string;
  /** Integer build number — increment with every new APK */
  buildNumber: number;
  /** Android package name */
  packageName: string;
  /** Direct download URL — populated dynamically from EAS */
  downloadUrl: string;
  /** Human-readable file size */
  size: string;
  /** Minimum Android version required */
  minAndroid: string;
  /** ISO-8601 date of this release */
  releasedAt: string;
  /** Changelog entries for this version */
  changelog: string[];
}

/** Static app metadata — downloadUrl will be overwritten at runtime */
const appMeta: Omit<AppRelease, 'downloadUrl' | 'version' | 'buildNumber' | 'releasedAt'>[] = [
  {
    app: 'dashboard',
    name: 'ElevatedPOS Dashboard',
    buildProfile: 'production-dashboard',
    description:
      'Central hub — launch POS, KDS, or Kiosk apps, view daily stats, and manage devices.',
    packageName: 'com.au.elevatedpos.dashboard',
    size: '~44 MB',
    minAndroid: 'Android 8.0+',
    changelog: ['Initial release', 'App launcher tiles for POS, KDS, and Kiosk', 'Daily order and revenue overview', 'Update checker for all apps'],
  },
  {
    app: 'pos',
    name: 'ElevatedPOS',
    buildProfile: 'production-pos',
    description:
      'Full point-of-sale terminal — product grid, cart, payments, receipt printing, and cash drawer control.',
    packageName: 'com.au.elevatedpos.pos',
    size: '~45 MB',
    minAndroid: 'Android 8.0+',
    changelog: ['Initial release', 'Product grid with categories', 'Cash, card, and split payment', 'ESC/POS receipt printing via USB & Serial', 'Offline mode support'],
  },
  {
    app: 'kds',
    name: 'ElevatedPOS KDS',
    buildProfile: 'production-kds',
    description:
      'Kitchen display system — real-time order tickets via WebSocket, bump-bar support, and timer alerts.',
    packageName: 'com.au.elevatedpos.kds',
    size: '~40 MB',
    minAndroid: 'Android 8.0+',
    changelog: ['Initial release', 'Real-time WebSocket order feed', 'Ticket status management (pending → in-progress → ready)', 'Colour-coded timer alerts', 'Landscape-locked display'],
  },
  {
    app: 'kiosk',
    name: 'ElevatedPOS Kiosk',
    buildProfile: 'production-kiosk',
    description:
      'Self-service ordering kiosk — menu browsing, modifier selection, cart review, and payment processing.',
    packageName: 'com.au.elevatedpos.kiosk',
    size: '~42 MB',
    minAndroid: 'Android 8.0+',
    changelog: ['Initial release', 'Category-based menu browsing', 'Product modifiers and special instructions', 'Dine-in and takeaway order types', 'Age verification gate'],
  },
  {
    app: 'display',
    name: 'ElevatedPOS Display',
    buildProfile: 'production-display',
    description:
      'Digital signage display — shows promotions, menu items, and order status on a customer-facing screen.',
    packageName: 'com.au.elevatedpos.display',
    size: '~38 MB',
    minAndroid: 'Android 8.0+',
    changelog: ['Initial release', 'Promotional content slideshow', 'Real-time order status board', 'Menu item highlights', 'Configurable from the back-office'],
  },
];

/* ------------------------------------------------------------------ */
/*  EAS API integration — fetch latest successful build per profile    */
/* ------------------------------------------------------------------ */

const EAS_PROJECT_ID = '5f03d9c6-0120-4047-aa27-f71a823afa7b';
const EAS_GRAPHQL = 'https://api.expo.dev/graphql';
const EXPO_TOKEN = process.env['EXPO_TOKEN'] ?? process.env['EAS_ACCESS_TOKEN'] ?? '';

interface EASBuild {
  id: string;
  status: string;
  platform: string;
  artifacts: { buildUrl?: string };
  appVersion?: string;
  appBuildVersion?: string;
  createdAt: string;
  buildProfile?: string;
}

/** In-memory cache: profile → { release, fetchedAt } */
const cache = new Map<string, { release: AppRelease; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchLatestEASBuild(buildProfile: string): Promise<EASBuild | null> {
  if (!EXPO_TOKEN) return null;

  try {
    const query = `query ($appId: String!, $buildProfile: String!) {
      app {
        byId(appId: $appId) {
          buildsPaginated(first: 1, filter: { buildProfile: $buildProfile }) {
            edges {
              node {
                ... on Build {
                  id
                  status
                  platform
                  buildProfile
                  appVersion
                  appBuildVersion
                  createdAt
                  artifacts { buildUrl }
                }
              }
            }
          }
        }
      }
    }`;

    const res = await fetch(EAS_GRAPHQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${EXPO_TOKEN}`,
      },
      body: JSON.stringify({
        query,
        variables: { appId: EAS_PROJECT_ID, buildProfile },
      }),
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const edges = json?.data?.app?.byId?.buildsPaginated?.edges ?? [];
    if (edges.length === 0) return null;

    const node = edges[0]?.node;
    if (!node || node.status !== 'FINISHED' || node.platform !== 'ANDROID') return null;

    return node as EASBuild;
  } catch {
    return null;
  }
}

/**
 * Get the latest release for a given app, with dynamic EAS URL resolution.
 * Falls back to static metadata if EAS is unreachable.
 */
export async function getLatestRelease(app: string): Promise<AppRelease | undefined> {
  const meta = appMeta.find((m) => m.app === app);
  if (!meta) return undefined;

  // Check cache first
  const cached = cache.get(meta.buildProfile);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.release;
  }

  // Query EAS API for latest build
  const build = await fetchLatestEASBuild(meta.buildProfile);

  const fallbackDate = new Date().toISOString().split('T')[0] as string;
  const buildDate = build?.createdAt ? build.createdAt.split('T')[0] : undefined;

  const release: AppRelease = {
    ...meta,
    version: build?.appVersion ?? '1.0.0',
    buildNumber: build?.appBuildVersion ? parseInt(build.appBuildVersion, 10) : 1,
    downloadUrl: build?.artifacts?.buildUrl ?? '',
    releasedAt: buildDate ?? fallbackDate,
  };

  cache.set(meta.buildProfile, { release, fetchedAt: Date.now() });
  return release;
}

/**
 * Get all releases with dynamic URLs.
 */
export async function getAllReleases(): Promise<AppRelease[]> {
  const results = await Promise.all(
    appMeta.map((m) => getLatestRelease(m.app)),
  );
  return results.filter((r): r is AppRelease => r !== undefined);
}
