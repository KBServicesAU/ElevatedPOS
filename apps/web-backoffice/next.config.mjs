import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@nexus/ui-components', '@nexus/api-client'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: 'elevatedpos',
  project: 'elevatedpos-web',
  // Suppress Sentry CLI output during builds
  silent: true,
  // Upload all JS source maps (not just the entry chunk) for better stack traces
  widenClientFileUpload: true,
  // Hide source maps from the browser bundle
  hideSourceMaps: true,
  // Automatically instrument server-side components
  autoInstrumentServerFunctions: true,
});
