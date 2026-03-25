/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { scrollRestoration: true },
  images: {
    remotePatterns: [{
      protocol: 'https',
      hostname: 'munia-s3-bucket.s3.us-east-1.amazonaws.com',
      port: '',
    }],
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { isServer }) => {
    config.cache = false;
    return config;
  },
};
module.exports = nextConfig;
