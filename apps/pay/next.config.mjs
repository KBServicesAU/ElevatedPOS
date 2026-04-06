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
};
export default nextConfig;
