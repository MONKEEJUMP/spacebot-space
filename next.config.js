/** @type {import('next').NextConfig} */
const nextConfig = {
  // FIX 47 (LUCY audit Item 47) — standalone build output
  output: 'standalone',

  async redirects() {
    return [
      {
        source: '/feedspace',
        destination: '/newsspace',
        permanent: true,
      },
      {
        source: '/feedspace/:path*',
        destination: '/newsspace/:path*',
        permanent: true,
      },
    ];
  },

  experimental: { scrollRestoration: true },

  images: {
    remotePatterns: [],
  },

  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },

  webpack: (config, { isServer }) => {
    config.cache = false;
    return config;
  },
};

module.exports = nextConfig;
