/**
 * Sentry error monitoring — DISABLED for v2.7.7 blank-screen diagnostic.
 *
 * The native Sentry ContentProviders (SentryInitProvider,
 * SentryPerformanceProvider) registered by the @sentry/react-native/expo
 * config plugin fire at Application.onCreate() before any JS executes.
 * We are bisecting a native crash that produces a straight-to-black screen
 * with no splash on iMin + generic Android tablets; Sentry's native init
 * is the lead suspect. This file no-ops so that no import of
 * @sentry/react-native occurs from JS, and the config plugin is also
 * removed from app.config.ts so the ContentProviders are not registered
 * in the generated AndroidManifest.xml.
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
