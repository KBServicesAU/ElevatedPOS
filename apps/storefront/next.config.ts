import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.elevatedpos.com.au' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  async rewrites() {
    return [
      // Connect / payments endpoints → integrations service (must come before the catalog catch-all)
      {
        source: '/api/v1/connect/:path*',
        destination: `${process.env['INTEGRATIONS_SERVICE_URL'] ?? 'http://localhost:4010'}/api/v1/connect/:path*`,
      },
      // Everything else → catalog service
      {
        source: '/api/:path*',
        destination: `${process.env['CATALOG_SERVICE_URL'] ?? 'http://localhost:3004'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
