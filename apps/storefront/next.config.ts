import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.elevatedpos.com.au' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env['CATALOG_SERVICE_URL'] ?? 'http://localhost:3004'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
