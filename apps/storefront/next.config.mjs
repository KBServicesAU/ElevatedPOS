/** @type {import('next').NextConfig} */
const nextConfig = {
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
        destination: `${process.env.INTEGRATIONS_SERVICE_URL ?? 'http://localhost:4010'}/api/v1/connect/:path*`,
      },
      // Everything else → catalog service
      {
        source: '/api/:path*',
        destination: `${process.env.CATALOG_SERVICE_URL ?? 'http://localhost:4002'}/api/:path*`,
      },
    ];
  },
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

export default nextConfig;
