/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@nexus/ui-components', '@nexus/api-client'],
};

export default nextConfig;
