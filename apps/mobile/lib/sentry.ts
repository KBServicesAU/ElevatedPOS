import * as Sentry from '@sentry/react-native';

/**
 * Initialise Sentry error monitoring.
 *
 * Call once at app startup, before the root component mounts.
 * Requires EXPO_PUBLIC_SENTRY_DSN to be set in the environment.
 * In development builds the SDK is disabled so noise is suppressed.
 */
export function initSentry(): void {
  const dsn = process.env['EXPO_PUBLIC_SENTRY_DSN'];
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    // Only sample traces in production to avoid performance overhead in dev
    tracesSampleRate: __DEV__ ? 0 : 0.1,
    // Disable SDK entirely in dev builds — errors are visible in the metro console
    enabled: !__DEV__,
    beforeSend(event) {
      // Strip any request bodies that might contain PII / card data
      if (event.request?.data) {
        delete event.request.data;
      }
      return event;
    },
  });
}

export { Sentry };
