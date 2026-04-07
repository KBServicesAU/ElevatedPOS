/**
 * Centralised release manifest for ElevatedPOS mobile apps.
 *
 * After each EAS build, update the relevant entry here:
 *   1. Bump the `version` string
 *   2. Replace the `downloadUrl` with the new EAS / S3 artifact URL
 *   3. Update `size` and `changelog`
 *   4. Redeploy the storefront (or just this API route if using ISR)
 */

export interface AppRelease {
  /** Machine-readable app identifier */
  app: 'pos' | 'kds' | 'kiosk';
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Semantic version (must match app.config.ts version) */
  version: string;
  /** Integer build number — increment with every new APK */
  buildNumber: number;
  /** Android package name */
  packageName: string;
  /** Direct download URL (EAS artifact, S3, or CDN) */
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

const releases: AppRelease[] = [
  {
    app: 'pos',
    name: 'ElevatedPOS',
    description:
      'Full point-of-sale terminal — product grid, cart, payments, receipt printing, and cash drawer control.',
    version: '1.0.0',
    buildNumber: 1,
    packageName: 'com.au.elevatedpos.pos',
    downloadUrl: 'https://expo.dev/artifacts/eas/bTX1LFF1cVw4NBH2SqRzzo.apk',
    size: '~45 MB',
    minAndroid: 'Android 8.0+',
    releasedAt: '2026-04-07',
    changelog: ['Initial release', 'Product grid with categories', 'Cash, card, and split payment', 'ESC/POS receipt printing via USB & Serial', 'Offline mode support'],
  },
  {
    app: 'kds',
    name: 'ElevatedPOS KDS',
    description:
      'Kitchen display system — real-time order tickets via WebSocket, bump-bar support, and timer alerts.',
    version: '1.0.0',
    buildNumber: 1,
    packageName: 'com.au.elevatedpos.kds',
    downloadUrl: 'https://expo.dev/artifacts/eas/brE4RvVKsk97JppwDAGCtk.apk',
    size: '~40 MB',
    minAndroid: 'Android 8.0+',
    releasedAt: '2026-04-07',
    changelog: ['Initial release', 'Real-time WebSocket order feed', 'Ticket status management (pending → in-progress → ready)', 'Colour-coded timer alerts', 'Landscape-locked display'],
  },
  {
    app: 'kiosk',
    name: 'ElevatedPOS Kiosk',
    description:
      'Self-service ordering kiosk — menu browsing, modifier selection, cart review, and payment processing.',
    version: '1.0.0',
    buildNumber: 1,
    packageName: 'com.au.elevatedpos.kiosk',
    downloadUrl: 'https://expo.dev/artifacts/eas/r9ZPnuTvxRyqtHHYm8QsQp.apk',
    size: '~42 MB',
    minAndroid: 'Android 8.0+',
    releasedAt: '2026-04-07',
    changelog: ['Initial release', 'Category-based menu browsing', 'Product modifiers and special instructions', 'Dine-in and takeaway order types', 'Age verification gate'],
  },
];

export function getLatestRelease(app: string): AppRelease | undefined {
  return releases.find((r) => r.app === app);
}

export function getAllReleases(): AppRelease[] {
  return releases;
}
