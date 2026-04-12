import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env['NEXT_PUBLIC_SENTRY_DSN'],
  environment: process.env['NODE_ENV'],
  tracesSampleRate: 0.1,
  // Session replays — light sampling in production, full capture on errors
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  // Only enable in production to keep local dev noise-free
  enabled: process.env['NODE_ENV'] === 'production',
  integrations: [Sentry.replayIntegration()],
});
