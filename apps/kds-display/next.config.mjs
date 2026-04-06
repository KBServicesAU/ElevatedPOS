/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    const ordersUrl = process.env.ORDERS_API_URL ?? 'http://localhost:4004';
    return [
      {
        source: '/api/bump/:orderId',
        destination: `${ordersUrl}/api/v1/kds/bump/:orderId`,
      },
    ];
  },
};
export default nextConfig;
