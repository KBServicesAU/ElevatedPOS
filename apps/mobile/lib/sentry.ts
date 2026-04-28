/**
 * Sentry error monitoring — DISABLED, must be re-enabled before go-live.
 *
 * Original disable (v2.7.7): Sentry's native ContentProviders
 * (SentryInitProvider, SentryPerformanceProvider) registered by the
 * `@sentry/react-native/expo` config plugin fire at Application.onCreate()
 * BEFORE any JS executes. While bisecting a "straight-to-black screen,
 * no splash" native crash on iMin + generic Android tablets, Sentry's
 * native init was the lead suspect, so this file was no-op'd, the
 * `@sentry/react-native` package was uninstalled, and the config plugin
 * was removed from app.config.ts.
 *
 * v2.7.61 audit: package is still uninstalled (see apps/mobile/package.json),
 * the config-plugin entry in app.config.ts is still commented out, and
 * this file still no-ops. We have ZERO crash visibility in prod.
 *
 * ── Re-enable path (do this on a non-iMin device first) ──────────────────
 *   1. `pnpm add @sentry/react-native@^5.x` (NOT 6.x — that's the version
 *      that broke v2.7.7; pin to 5.x until the upstream issue is closed)
 *   2. Re-add the config plugin in app.config.ts:
 *        ['@sentry/react-native/expo', { organization: 'elevatedpos',
 *                                         project: 'elevatedpos-mobile' }]
 *   3. Replace this file with a real `Sentry.init({ dsn, ... })` call
 *      in `initSentry()`, and proxy `captureException` / `captureMessage`
 *      to the actual SDK.
 *   4. Build a preview APK, install on a NON-iMin Android device, verify
 *      it boots past the splash. Throw a test exception, confirm it lands
 *      in the Sentry dashboard.
 *   5. Then build for iMin and confirm no regression. If iMin still
 *      crashes, the workaround is JS-only init — skip the config plugin
 *      entirely and call `Sentry.init()` from JS at app start; you lose
 *      native-crash capture (Java/Kotlin layer) but keep JS error capture.
 *
 * Until that path is walked, this file stays no-op so the rest of the
 * codebase compiles unchanged.
 */
export function initSentry(): void {
  // intentional no-op
}

// Stub to keep any legacy `import { Sentry }` consumers compiling.
export const Sentry = {
  captureException: (_err: unknown, _ctx?: unknown): void => {
    // no-op while Sentry is disabled
  },
  captureMessage: (_msg: string): void => {
    // no-op while Sentry is disabled
  },
} as const;
