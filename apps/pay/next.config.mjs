/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    const integrationsUrl = process.env.INTEGRATIONS_API_URL ?? 'http://localhost:4010';
    return [
      {
        source: '/api/pay-intent',
        destination: `${integrationsUrl}/api/v1/connect/pay-intent`,
      },
      {
        source: '/api/portal-lookup',
        destination: `${integrationsUrl}/api/v1/connect/portal-lookup`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
export default nextConfig;
